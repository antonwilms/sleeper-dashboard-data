#!/usr/bin/env node
/**
 * scripts/registry-audit.mjs — CLI wrapper over lib/registry.mjs's field-block parser.
 * Reports cache-field anchor counts (data-side / app-side) for the mirrored registry
 * region in README.md. Read-only; no writes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractRegistryRegion,
  parseEntries,
  countCacheFieldAnchors,
  dataSideText,
  appSideText,
  countAnchors,
} from '../lib/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readmePath = path.join(__dirname, '..', 'README.md');
const text = fs.readFileSync(readmePath, 'utf8');
const region = extractRegistryRegion(text);
const entries = parseEntries(region);

const { dataSide, appSide } = countCacheFieldAnchors(entries);
console.log(`entries parsed: ${entries.length}`);
console.log(`data-side cache-field anchors: ${dataSide}`);
console.log(`app-side cache-field anchors:  ${appSide}`);
console.log('');
console.log('per-entry breakdown:');
for (const entry of entries) {
  const d = countAnchors(dataSideText(entry));
  const a = countAnchors(appSideText(entry));
  if (d || a) console.log(`  ${entry.id}: data=${d} app=${a}`);
}
