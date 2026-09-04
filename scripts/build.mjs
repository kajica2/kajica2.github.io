#!/usr/bin/env node
// build.mjs — paywall-gated build
// Reads projects.json + agents.json, renders HTML pages, writes public/ and internal/ trees.
//
// Usage:
//   node scripts/build.mjs --source <dir> --out <dir>
//
// Exit codes: 0 ok, 1 paywall leak in source, 2 template/source missing.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const SOURCE = resolve(arg('--source', join(ROOT, 'examples')));
const OUT    = resolve(arg('--out',    join(ROOT, 'dist')));

if (!existsSync(SOURCE)) {
  console.error(`source not found: ${SOURCE}`);
  process.exit(2);
}

const projects = JSON.parse(readFileSync(
  existsSync(join(SOURCE, 'projects.json'))
    ? join(SOURCE, 'projects.json')
    : join(SOURCE, 'projects.example.json'), 'utf8'));
const agents   = JSON.parse(readFileSync(
  existsSync(join(SOURCE, 'agents.json'))
    ? join(SOURCE, 'agents.json')
    : join(SOURCE, 'agents.example.json'), 'utf8'));

const PAYWALL_KINDS = new Set(['internal-paywalled', 'licensed-restricted', 'private']);

// Build accepts master data (with paywalled entries) and partitions it.
// Public output MUST NOT contain paywalled entries — we filter and then assert.
function partitionPaywalled(items, label) {
  const PAYWALL_KINDS = new Set(['internal-paywalled', 'licensed-restricted', 'private']);
  const publicItems = [];
  const internalItems = [];
  for (const item of items) {
    if (item?.material_license?.kind && PAYWALL_KINDS.has(item.material_license.kind)) {
      internalItems.push(item);
    } else {
      publicItems.push(item);
    }
  }
  console.log(`  ${label}: ${publicItems.length} public + ${internalItems.length} internal-paywalled`);
  return { publicItems, internalItems };
}

function assertNoPaywallInPublic(items, label) {
  const leaks = items.filter(it => it?.material_license?.kind && PAYWALL_KINDS.has(it.material_license.kind));
  if (leaks.length) {
    console.error(`✗ FATAL: ${label} contains ${leaks.length} paywalled entries — would have leaked publicly:`);
    for (const l of leaks) console.error(`    ! ${l.name}: kind="${l.material_license.kind}"`);
    process.exit(1);
  }
}

const projectsPartitioned = partitionPaywalled(projects, 'projects');
const agentsPartitioned   = partitionPaywalled(agents,   'agents');

// After partitioning, assert that public side is clean.
assertNoPaywallInPublic(projectsPartitioned.publicItems, 'projects public side');
assertNoPaywallInPublic(agentsPartitioned.publicItems,   'agents public side');

// Use the partitioned public lists from here on.
const publicProjects = projectsPartitioned.publicItems;
const publicAgents   = agentsPartitioned.publicItems;

const byEntity = (items) => items.reduce((acc, x) => {
  const e = x.entity || 'research';
  (acc[e] = acc[e] || []).push(x);
  return acc;
}, {});

function renderCard(p) {
  const tags = (p.capabilities || []).slice(0, 4).map(c => `<span class="cap">${c}</span>`).join('');
  const license = p.material_license?.kind || 'public';
  const link = p.url
    ? `<a href="${p.url}" target="_blank" rel="noopener">open ↗</a>`
    : `<a href="${p.repo}" target="_blank" rel="noopener">repo ↗</a>`;
  return `
    <article class="card" data-umbrella="${p.umbrella}">
      <h3>${p.display_name || p.name}</h3>
      <p class="desc">${p.description}</p>
      <div class="meta">
        <span class="umbrella ${p.umbrella}">${p.umbrella}</span>
        <span class="license">${license}</span>
      </div>
      <div class="caps">${tags}</div>
      <div class="links">${link}</div>
    </article>`;
}

function renderIndex(projects, agents, label) {
  const byU = byEntity(projects);
  const umbrellas = Object.keys(byU);
  const sections = umbrellas.map(u => `
    <section class="umbrella ${u}">
      <h2>${u}</h2>
      <div class="grid">
        ${byU[u].map(renderCard).join('')}
      </div>
    </section>`).join('');
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Sovereign Signal — ${label}</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; background:#04060a; color:#d6e1f0; margin:0; padding:2rem; }
  h1 { color:#00e5ff; margin:0 0 0.5rem; }
  h2 { color:#ff3df0; text-transform:uppercase; letter-spacing:0.1em; font-size:0.9rem; margin:2rem 0 1rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1rem; }
  .card { background:#0a0f17; border:1px solid #1a2533; border-radius:8px; padding:1rem; }
  .card:hover { border-color:#00e5ff; }
  .card h3 { margin:0 0 0.5rem; color:#d6e1f0; font-size:1.1rem; }
  .desc { color:#6b7d96; font-size:0.9rem; margin:0 0 0.75rem; }
  .meta { display:flex; gap:0.5rem; margin-bottom:0.5rem; }
  .umbrella { padding:2px 6px; border-radius:3px; font-size:0.75rem; background:#1a2533; color:#00e5ff; }
  .umbrella.music { color:#ff3df0; }
  .umbrella.audio { color:#00e5ff; }
  .umbrella.video { color:#ffb547; }
  .umbrella.programming { color:#5cffa0; }
  .license { padding:2px 6px; border-radius:3px; font-size:0.75rem; background:#0e1622; color:#6b7d96; }
  .caps { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:0.5rem; }
  .cap { font-size:0.7rem; padding:2px 5px; border-radius:2px; background:#1a2533; color:#5cffa0; font-family:ui-monospace,monospace; }
  .links a { color:#00e5ff; text-decoration:none; font-size:0.85rem; }
  .links a:hover { color:#ff3df0; }
  header { border-bottom:1px solid #1a2533; padding-bottom:1rem; margin-bottom:2rem; display:flex; justify-content:space-between; align-items:end; }
  header .entity-switch a { color:#6b7d96; margin-left:1rem; text-decoration:none; font-size:0.85rem; }
  header .entity-switch a.active { color:#00e5ff; }
</style></head>
<body>
<header>
  <div>
    <h1>Sovereign Signal — ${label}</h1>
    <p style="color:#6b7d96;margin:0;">${projects.length} projects · ${agents.length} agents · paywall enforced</p>
  </div>
  <nav class="entity-switch">
    <a href="../research/index.html" class="${label === 'Research' ? 'active' : ''}">Research</a>
    <a href="../eye-kairi/index.html" class="${label === 'Eye & Kairi' ? 'active' : ''}">Eye &amp; Kairi</a>
  </nav>
</header>
${sections}
</body></html>`;
}

mkdirSync(join(OUT, 'public', 'research'),   { recursive: true });
mkdirSync(join(OUT, 'public', 'eye-kairi'),  { recursive: true });
mkdirSync(join(OUT, 'public', 'agents'),     { recursive: true });
mkdirSync(join(OUT, 'public', 'api', 'v1'),  { recursive: true });
mkdirSync(join(OUT, 'internal'),             { recursive: true });

const researchProjects = publicProjects.filter(p => (p.entity || 'research') === 'research');
const ekProjects       = publicProjects.filter(p => p.entity === 'eye-kairi');
const internalProjects = projectsPartitioned.internalItems;

writeFileSync(join(OUT, 'public', 'research',  'index.html'), renderIndex(researchProjects, agents, 'Research'));
writeFileSync(join(OUT, 'public', 'eye-kairi', 'index.html'), renderIndex(ekProjects,       agents, 'Eye & Kairi'));

const agentCards = publicAgents.map(a => `
  <article class="card" data-kind="${a.kind}" data-status="${a.status}">
    <h3>${a.display_name}</h3>
    <p class="desc">${a.purpose}</p>
    <div class="meta">
      <span class="kind ${a.kind}">${a.kind}</span>
      <span class="status">${a.status}</span>
    </div>
    ${a.capabilities ? `<div class="caps">${a.capabilities.slice(0,4).map(c=>`<span class="cap">${c}</span>`).join('')}</div>` : ''}
  </article>`).join('');

writeFileSync(join(OUT, 'public', 'agents', 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>Agents</title>
<style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;background:#04060a;color:#d6e1f0;margin:0;padding:2rem}h1{color:#00e5ff}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}.card{background:#0a0f17;border:1px solid #1a2533;border-radius:8px;padding:1rem}.card:hover{border-color:#ff3df0}.card h3{margin:0 0 .5rem}.desc{color:#6b7d96;font-size:.9rem;margin:0 0 .75rem}.meta{display:flex;gap:.5rem;margin-bottom:.5rem}.kind,.status{padding:2px 6px;border-radius:3px;font-size:.75rem;background:#1a2533;color:#00e5ff}.kind.utility{color:#ff3df0}.kind.research{color:#00e5ff}.kind.infrastructure{color:#ffb547}.caps{display:flex;flex-wrap:wrap;gap:4px}.cap{font-size:.7rem;padding:2px 5px;border-radius:2px;background:#1a2533;color:#5cffa0;font-family:ui-monospace,monospace}</style>
</head><body>
<h1>Agent Team — ${agents.length} personas</h1>
<div class="grid">${agentCards}</div>
</body></html>`);

const publicState = {
  version: 'v1',
  generated_at: new Date().toISOString(),
  projects: researchProjects.map(p => ({
    name: p.name, umbrella: p.umbrella, url: p.url, repo: p.repo,
    description: p.description, capabilities: p.capabilities, entity: p.entity || 'research',
  })),
  agents: publicAgents.filter(a => a.visibility !== 'private').map(a => ({
    name: a.name, display_name: a.display_name, kind: a.kind,
    purpose: a.purpose, capabilities: a.capabilities, status: a.status, entity: a.entity || 'research',
  })),
  paywalled_count: internalProjects.length,
  note: 'Paywalled entries are not listed. Contact for engagement terms.',
};
writeFileSync(join(OUT, 'public', 'api', 'v1', 'state.json'), JSON.stringify(publicState, null, 2));

writeFileSync(join(OUT, 'internal', 'projects.json'), JSON.stringify(internalProjects, null, 2));
writeFileSync(join(OUT, 'internal', 'state.json'), JSON.stringify({
  version: 'v1-internal',
  generated_at: new Date().toISOString(),
  paywalled_projects: internalProjects,
}, null, 2));

console.log(`✓ Built ${researchProjects.length} research + ${ekProjects.length} eye-kairi + ${internalProjects.length} paywalled (internal-only)`);
console.log(`  → ${OUT}/public/`);
console.log(`  → ${OUT}/internal/`);
