import type { Tweet } from '../game/tweetCanvas';
import { EXAMPLE_TWEETS } from '../game/exampleTweets';
import { httpEndpointFromWs } from './leaderboard';

interface BillboardTweetResponse {
  tweets?: BillboardTweetWire[];
}

interface BillboardTweetWire {
  id?: unknown;
  companyUsername?: unknown;
  authorUsername?: unknown;
  authorName?: unknown;
  authorAvatarUrl?: unknown;
  body?: unknown;
  url?: unknown;
  publishedAt?: unknown;
}

function resolveDefaultTweetsHttpEndpoint(): string {
  const param = new URLSearchParams(window.location.search).get('mp')?.trim();
  const wsEndpoint =
    param || (import.meta.env.VITE_MULTIPLAYER_URL ?? '').trim() || 'ws://localhost:2567';
  return httpEndpointFromWs(wsEndpoint);
}

export async function loadBillboardTweets(
  httpEndpoint = resolveDefaultTweetsHttpEndpoint(),
  timeoutMs = 2500,
): Promise<readonly Tweet[]> {
  const url = `${httpEndpoint.replace(/\/$/, '')}/tweets`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return EXAMPLE_TWEETS;
    const body = (await res.json()) as BillboardTweetResponse;
    const tweets = (body.tweets ?? []).map(mapWireTweet).filter(isTweet);
    return tweets.length > 0 ? tweets : EXAMPLE_TWEETS;
  } catch {
    return EXAMPLE_TWEETS;
  } finally {
    clearTimeout(timer);
  }
}

function mapWireTweet(row: BillboardTweetWire): Tweet | null {
  const id = stringValue(row.id);
  const body = stringValue(row.body);
  const url = stringValue(row.url);
  if (!id || !body || !url) return null;
  const authorUsername = stringValue(row.authorUsername);
  const companyUsername = stringValue(row.companyUsername);
  const handle = authorUsername || companyUsername;
  return {
    id,
    body,
    createdAt: shortDate(stringValue(row.publishedAt)),
    url,
    author: {
      name: stringValue(row.authorName) || handle || 'Milk Dreams',
      handle: handle ? `@${handle.replace(/^@/, '')}` : '@milk_dreams',
      avatarUrl: stringValue(row.authorAvatarUrl) || undefined,
    },
  };
}

function isTweet(tweet: Tweet | null): tweet is Tweet {
  return tweet !== null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
