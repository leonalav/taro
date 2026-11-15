import manifest from './data/sources.json';
import { createConventionRegistry, type ConventionRegistry } from './registry';
import type { ConventionRule, SourceRecord } from './types';

const loaders = {
  'wcag-2.2': () => import('./data/packs/wcag-2.2.json'),
  'aria-apg': () => import('./data/packs/aria-apg.json'),
  nielsen: () => import('./data/packs/nielsen.json'),
  shneiderman: () => import('./data/packs/shneiderman.json'),
};
let registry: Promise<ConventionRegistry> | undefined;
export function loadBundledRegistry() {
  registry ??= Promise.all(Object.values(loaders).map(load => load()))
    .then(packs => createConventionRegistry(manifest.sources as SourceRecord[], packs.flatMap(pack => pack.default.rules as ConventionRule[])))
    .catch(error => { registry = undefined; throw error; });
  return registry;
}
