import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface BillboardTweet {
  id: string;
  companyUsername: string;
  authorUsername: string;
  authorName: string;
  authorAvatarUrl: string;
  body: string;
  url: string;
  publishedAt: string;
}

interface BillboardTweetRow {
  tweet_id?: unknown;
  company_username?: unknown;
  author_username?: unknown;
  author_name?: unknown;
  author_profile_picture?: unknown;
  body?: unknown;
  url?: unknown;
  published_at?: unknown;
}

const RPC_TIMEOUT_MS = Number(process.env.SUPABASE_RPC_TIMEOUT_MS ?? 1500);

let singleton: TweetsStore | null = null;

export interface TweetsStore {
  readonly enabled: boolean;
  billboardTweets(): Promise<readonly BillboardTweet[]>;
}

const NOOP_STORE: TweetsStore = {
  enabled: false,
  async billboardTweets() {
    return [];
  },
};

export function getTweetsStore(): TweetsStore {
  if (!singleton) singleton = createTweetsStore();
  return singleton;
}

export function createTweetsStore(): TweetsStore {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    console.log(
      '[tweets] SUPABASE_URL / SUPABASE_ANON_KEY not set - tweets disabled.',
    );
    return NOOP_STORE;
  }

  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'milk_dreams' as never },
  });

  async function withTimeout<T>(
    label: string,
    op: PromiseLike<T>,
  ): Promise<T> {
    return await Promise.race<T>([
      Promise.resolve(op),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${label} timed out after ${RPC_TIMEOUT_MS}ms`));
        }, RPC_TIMEOUT_MS);
      }),
    ]);
  }

  return {
    enabled: true,
    async billboardTweets() {
      try {
        const { data, error } = await withTimeout(
          'billboard_tweets',
          client.rpc('billboard_tweets'),
        );
        if (error) {
          console.warn(`[tweets] billboard_tweets failed: ${error.message}`);
          return [];
        }
        return normaliseBillboardTweets((data ?? []) as BillboardTweetRow[]);
      } catch (err) {
        console.warn(
          `[tweets] billboard_tweets threw: ${(err as Error).message}`,
        );
        return [];
      }
    },
  };
}

function normaliseBillboardTweets(
  rows: readonly BillboardTweetRow[],
): BillboardTweet[] {
  const out: BillboardTweet[] = [];
  for (const row of rows) {
    const id = stringValue(row.tweet_id);
    const url = stringValue(row.url);
    const publishedAt = stringValue(row.published_at);
    const body = cleanTweetBody(stringValue(row.body));
    if (!id || !url || !body) continue;
    out.push({
      id,
      companyUsername: stringValue(row.company_username),
      authorUsername: stringValue(row.author_username),
      authorName: stringValue(row.author_name) || stringValue(row.company_username),
      authorAvatarUrl: stringValue(row.author_profile_picture),
      body,
      url,
      publishedAt,
    });
  }
  return out;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanTweetBody(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:www\.)\S+\.\S+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/(?:[-|:;,.]\s*)+$/g, '')
    .trim();
}
