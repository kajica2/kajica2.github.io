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
    <h3><a href="${a.name}.html">${a.display_name}</a></h3>
    <p class="desc">${a.purpose}</p>
    <div class="meta">
      <span class="kind ${a.kind}">${a.kind}</span>
      <span class="status">${a.status}</span>
    </div>
    ${a.capabilities ? `<div class="caps">${a.capabilities.slice(0,4).map(c=>`<span class="cap">${c}</span>`).join('')}</div>` : ''}
  </article>`).join('');

writeFileSync(join(OUT, 'public', 'agents', 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>Agents</title>
<style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;background:#04060a;color:#d6e1f0;margin:0;padding:2rem}h1{color:#00e5ff}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}.card{background:#0a0f17;border:1px solid #1a2533;border-radius:8px;padding:1rem}.card:hover{border-color:#ff3df0}.card h3{margin:0 0 .5rem}.desc{color:#6b7d96;font-size:.9rem;margin:0 0 .75rem}.meta{display:flex;gap:.5rem;margin-bottom:.5rem}.kind,.status{padding:2px 6px;border-radius:3px;font-size:.75rem;background:#1a2533;color:#00e5ff}.kind.utility{color:#ff3df0}.kind.research{color:#00e5ff}.kind.infrastructure{color:#ffb547}.caps{display:flex;flex-wrap:wrap;gap:4px}.cap{font-size:.7rem;padding:2px 5px;border-radius:2px;background:#1a2533;color:#5cffa0;font-family:ui-monospace,monospace}.card h3 a{color:inherit;text-decoration:none}.card h3 a:hover{color:#00e5ff}</style>
</head><body>
<h1>Agent Team — ${agents.length} personas</h1>
<div class="grid">${agentCards}</div>
</body></html>`);

// ---------------------------------------------------------------------------
// Per-agent pages — public/agents/<name>.html + monogram graphics.
// Plan §18C: graphic, purpose, inputs/outputs, capabilities, calls-into,
// called-by (reverse index), depends-on. Private agents get no page at all;
// unlisted agents get a page but a noindex robots tag.
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const KIND_COLORS = {
  utility: '#ff3df0', research: '#00e5ff', infrastructure: '#ffb547',
  creative: '#5cffa0', orchestrator: '#d6e1f0',
};

function monogramSvg(a) {
  const c = KIND_COLORS[a.kind] || '#00e5ff';
  const label = a.display_name || a.name;
  const letter = label.trim().charAt(0).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${esc(label)}">
  <rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="#0a0f17" stroke="${c}" stroke-width="1.5"/>
  <circle cx="32" cy="32" r="21" fill="none" stroke="${c}" stroke-width="0.75" opacity="0.35"/>
  <text x="32" y="41" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,monospace" font-size="26" fill="${c}">${esc(letter)}</text>
</svg>
`;
}

// Reverse index: which public agents reference this one in calls_into / depend_on.
function callersOf(agent) {
  const hay = agent.name.toLowerCase();
  return publicAgents.filter(x => x.name !== agent.name &&
    [...(x.calls_into || []), ...(x.depend_on || [])]
      .some(ref => String(ref).toLowerCase().includes(hay)));
}

function linkifyRef(ref) {
  const s = String(ref);
  if (publicAgents.some(x => x.name === s)) return `<a href="${s}.html">${esc(s)}</a>`;
  if (/^[\w.-]+\/[\w.-]+$/.test(s))
    return `<a href="https://huggingface.co/${esc(s)}" target="_blank" rel="noopener">${esc(s)} ↗</a>`;
  return esc(s);
}

function renderAgentPage(a, callers) {
  const c = KIND_COLORS[a.kind] || '#00e5ff';
  const chips = (arr) => (arr && arr.length)
    ? arr.map(x => `<span class="chip">${esc(x)}</span>`).join('')
    : '<span class="none">—</span>';
  const list = (arr, fn) => (arr && arr.length)
    ? `<ul>${arr.map(x => `<li>${fn(x)}</li>`).join('')}</ul>`
    : '<p class="none">—</p>';
  const noindex = a.visibility === 'unlisted' ? '\n<meta name="robots" content="noindex">' : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(a.display_name || a.name)} — Agent — Sovereign Signal</title>${noindex}
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; background:#04060a; color:#d6e1f0; margin:0; padding:2rem; max-width:760px; }
  a { color:#00e5ff; text-decoration:none; } a:hover { color:#ff3df0; }
  header { border-bottom:1px solid #1a2533; padding-bottom:1rem; margin-bottom:2rem; }
  header .crumb { font-size:0.8rem; color:#6b7d96; }
  .id { display:flex; gap:1rem; align-items:center; margin-top:1rem; }
  .id img { width:64px; height:64px; }
  .id h1 { margin:0; color:${c}; }
  .badges { display:flex; gap:.5rem; margin-top:.35rem; }
  .badges span { padding:2px 6px; border-radius:3px; font-size:.75rem; background:#1a2533; }
  .kind { color:${c}; } .status { color:#6b7d96; } .entity { color:#ffb547; }
  .purpose { font-size:1.05rem; color:#d6e1f0; border-left:3px solid ${c}; padding-left:1rem; margin:1.5rem 0; }
  .io { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin:1.5rem 0; }
  h2 { color:#6b7d96; text-transform:uppercase; letter-spacing:.1em; font-size:.75rem; margin:0 0 .5rem; }
  .chip { display:inline-block; font-size:.72rem; padding:2px 6px; margin:2px; border-radius:2px; background:#1a2533; color:#5cffa0; font-family:ui-monospace,monospace; }
  ul { margin:.25rem 0 0; padding-left:1.1rem; } li { margin:.2rem 0; }
  .none { color:#3a4a5f; }
  section { margin:1.5rem 0; }
  footer { margin-top:3rem; border-top:1px solid #1a2533; padding-top:1rem; font-size:.75rem; color:#3a4a5f; }
</style></head>
<body>
<header>
  <div class="crumb"><a href="../index.html">Sovereign Signal</a> / <a href="./">Agent Team</a> / ${esc(a.name)}</div>
  <div class="id">
    <img src="../assets/agents/${esc(a.name)}.svg" alt="${esc(a.display_name || a.name)} graphic" width="64" height="64">
    <div>
      <h1>${esc(a.display_name || a.name)}</h1>
      <div class="badges">
        <span class="kind">${esc(a.kind)}</span>
        <span class="status">${esc(a.status || 'unknown')}</span>
        <span class="entity">${esc(a.entity || 'research')}</span>
        ${a.visibility && a.visibility !== 'public' ? `<span>visibility: ${esc(a.visibility)}</span>` : ''}
      </div>
    </div>
  </div>
</header>

<p class="purpose">${esc(a.purpose)}</p>

<div class="io">
  <section><h2>Inputs</h2><div>${chips(a.inputs)}</div></section>
  <section><h2>Outputs</h2><div>${chips(a.outputs)}</div></section>
</div>

<section><h2>Capabilities</h2><div>${chips(a.capabilities)}</div></section>
<section><h2>Calls into</h2>${list(a.calls_into, linkifyRef)}</section>
<section><h2>Called by</h2>${callers.length
    ? `<ul>${callers.map(x => `<li><a href="${x.name}.html">${esc(x.display_name || x.name)}</a></li>`).join('')}</ul>`
    : '<p class="none">No agents reference this one yet.</p>'}</section>
<section><h2>Depends on</h2>${list(a.depend_on, esc)}</section>
<section><h2>Material access</h2><div>${chips(a.material_access)}</div></section>

<footer>Generated by agent-hub-framework build.mjs · owned by ${esc(a.owned_by || 'instance')} · paywall-gated</footer>
</body></html>`;
}

mkdirSync(join(OUT, 'public', 'assets', 'agents'), { recursive: true });
let pagesWritten = 0;
for (const a of publicAgents) {
  if (a.visibility === 'private') continue;
  const assetRel = join('assets', 'agents', `${a.name}.svg`);
  if (a.graphic && existsSync(join(SOURCE, a.graphic))) {
    // Respect a hand-authored graphic shipped in the source data.
    const svg = readFileSync(join(SOURCE, a.graphic));
    mkdirSync(dirname(join(OUT, 'public', assetRel)), { recursive: true });
    writeFileSync(join(OUT, 'public', assetRel), svg);
  } else {
    writeFileSync(join(OUT, 'public', assetRel), monogramSvg(a));
  }
  writeFileSync(join(OUT, 'public', 'agents', `${a.name}.html`), renderAgentPage(a, callersOf(a)));
  pagesWritten++;
}

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
console.log(`✓ Rendered ${pagesWritten} per-agent pages + graphics`);
console.log(`  → ${OUT}/public/`);
console.log(`  → ${OUT}/internal/`);
