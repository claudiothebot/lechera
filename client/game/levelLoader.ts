import {
  cloneLevelDefinition,
  DEFAULT_LEVEL_DEFINITION,
  levelDefinitionToJson,
  normalizeLevelDefinition,
  type LevelDefinition,
} from './levelDefinition';

export const DEFAULT_LEVEL_SOURCE_PATH = '/levels/level-01.json';
/**
 * Optional build/runtime override for a faster derived level artifact.
 * When configured, the loader will try this first and fall back to the
 * human-edited JSON source on any fetch/parse failure.
 */
export const DEFAULT_LEVEL_RUNTIME_PATH =
  (import.meta.env.VITE_LEVEL_RUNTIME_PATH ?? '').trim() || null;
export const DEFAULT_LEVEL_PATH = DEFAULT_LEVEL_SOURCE_PATH;

interface RuntimeLevelDefinitionEnvelope {
  format: 'milk-dreams-level-runtime';
  version: 1;
  level: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeEnvelope(value: unknown): value is RuntimeLevelDefinitionEnvelope {
  return (
    isRecord(value) &&
    value.format === 'milk-dreams-level-runtime' &&
    value.version === 1 &&
    'level' in value
  );
}

function normalizeLevelDefinitionPayload(payload: unknown): LevelDefinition {
  if (isRuntimeEnvelope(payload)) {
    return normalizeLevelDefinition(payload.level);
  }
  return normalizeLevelDefinition(payload);
}

export async function loadLevelDefinitionFromUrl(url: string): Promise<LevelDefinition> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`[level-loader] ${url} -> ${res.status} ${res.statusText}`);
  }
  return normalizeLevelDefinitionPayload(await res.json());
}

export async function loadLevelDefinitionFromUrls(
  urls: readonly string[],
): Promise<LevelDefinition> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      return await loadLevelDefinitionFromUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${url}: ${message}`);
    }
  }
  throw new Error(
    `[level-loader] failed to load level definition from any source\n${errors.join('\n')}`,
  );
}

export function defaultLevelDefinitionUrls(): string[] {
  return [
    ...(DEFAULT_LEVEL_RUNTIME_PATH ? [DEFAULT_LEVEL_RUNTIME_PATH] : []),
    DEFAULT_LEVEL_SOURCE_PATH,
  ];
}

export async function loadDefaultLevelDefinition(): Promise<LevelDefinition> {
  return loadLevelDefinitionFromUrls(defaultLevelDefinitionUrls());
}

export function parseLevelDefinitionJson(text: string): LevelDefinition {
  return normalizeLevelDefinitionPayload(JSON.parse(text) as unknown);
}

export function serializeLevelDefinition(definition: LevelDefinition): string {
  return levelDefinitionToJson(definition);
}

export function defaultLevelDefinition(): LevelDefinition {
  return cloneLevelDefinition(DEFAULT_LEVEL_DEFINITION);
}
