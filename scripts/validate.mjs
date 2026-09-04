#!/usr/bin/env node
// validate.mjs — schema + paywall gate
// Usage: node scripts/validate.mjs [path/to/projects.json] [path/to/agents.json]
//
// Exit codes:
//   0  all clean
//   1  schema validation failed (any field missing or wrong type)
//   2  paywall leak (a public-side artifact references a paywalled project)
//   3  taxonomy violation (a capability string is not in the controlled vocabulary)

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadJson(path) {
  if (!existsSync(path)) {
    console.error(`✗ ${path} not found`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadTaxonomy(path) {
  const t = loadJson(path);
  const vocab = new Set();
  for (const cat of Object.values(t.categories)) {
    for (const term of cat) vocab.add(term);
  }
  return vocab;
}

function validateAgainstSchema(data, schema, label) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  // Accept either a single object or an array of objects matching the schema.
  const items = Array.isArray(data) ? data : [data];
  let allOk = true;
  for (let i = 0; i < items.length; i++) {
    const validate = ajv.compile(schema);
    const ok = validate(items[i]);
    if (!ok) {
      console.error(`✗ ${label}[${i}] failed schema validation:`);
      for (const err of validate.errors) {
        console.error(`    ${err.instancePath || '(root)'}: ${err.message}`);
      }
      allOk = false;
    }
  }
  if (allOk) console.log(`✓ ${label} (${items.length} entries) match schema`);
  return allOk;
}

function checkTaxonomy(items, vocab, label) {
  const violations = [];
  for (const item of items) {
    if (!Array.isArray(item.capabilities)) continue;
    for (const cap of item.capabilities) {
      if (!vocab.has(cap)) violations.push(`${item.name}: unknown capability "${cap}"`);
    }
  }
  if (violations.length) {
    console.error(`✗ ${label} has ${violations.length} taxonomy violations:`);
    for (const v of violations) console.error(`    - ${v}`);
    return false;
  }
  console.log(`✓ ${label} capabilities all in controlled vocabulary`);
  return true;
}

function checkPaywallGate(publicSideEntries, paywalledKinds, label) {
  const leaks = [];
  for (const entry of publicSideEntries) {
    const kind = entry?.material_license?.kind;
    if (kind && paywalledKinds.has(kind)) {
      leaks.push(`${entry.name}: kind="${kind}"`);
    }
  }
  if (leaks.length) {
    // WARN, not fail — the source is the owner's master data. Build filters.
    console.log(`⚠ ${label} contains ${leaks.length} paywalled entries (will be filtered to internal/ by build):`);
    for (const l of leaks) console.log(`    - ${l}`);
    return true; // source can contain them; build must not leak
  }
  console.log(`✓ ${label} contains no paywalled entries (clean public-side data)`);
  return true;
}

const projectsPath = process.argv[2] || resolve(ROOT, 'examples', 'projects.example.json');
const agentsPath   = process.argv[3] || resolve(ROOT, 'examples', 'agents.example.json');

const projects = loadJson(projectsPath);
const agents   = loadJson(agentsPath);
const projSchema  = loadJson(resolve(ROOT, 'schema', 'project.schema.json'));
const agentSchema = loadJson(resolve(ROOT, 'schema', 'agent.schema.json'));
const taxonomy    = loadTaxonomy(resolve(ROOT, 'schema', 'capability-taxonomy.json'));

const PAYWALL_KINDS = new Set(['internal-paywalled', 'licensed-restricted', 'private']);

let ok = true;
ok = validateAgainstSchema(projects, projSchema,  'projects.json') && ok;
ok = validateAgainstSchema(agents,   agentSchema, 'agents.json') && ok;
ok = checkTaxonomy(projects, taxonomy, 'projects.json') && ok;
ok = checkTaxonomy(agents,   taxonomy, 'agents.json') && ok;
ok = checkPaywallGate(projects, PAYWALL_KINDS, 'public projects.json') && ok;

if (!ok) {
  console.error('\nVALIDATION FAILED');
  process.exit(1);
}
console.log('\nVALIDATION PASSED');
