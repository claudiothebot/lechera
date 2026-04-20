import {
  cloneLevelDefinition,
  DEFAULT_LEVEL_DEFINITION,
  levelDefinitionToJson,
  normalizeLevelDefinition,
  type LevelDefinition,
} from './levelDefinition';

export const DEFAULT_LEVEL_PATH = '/levels/level-01.json';

export async function loadLevelDefinitionFromUrl(url: string): Promise<LevelDefinition> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`[level-loader] ${url} -> ${res.status} ${res.statusText}`);
  }
  return normalizeLevelDefinition(await res.json());
}

export function parseLevelDefinitionJson(text: string): LevelDefinition {
  return normalizeLevelDefinition(JSON.parse(text) as unknown);
}

export function serializeLevelDefinition(definition: LevelDefinition): string {
  return levelDefinitionToJson(definition);
}

export function defaultLevelDefinition(): LevelDefinition {
  return cloneLevelDefinition(DEFAULT_LEVEL_DEFINITION);
}
