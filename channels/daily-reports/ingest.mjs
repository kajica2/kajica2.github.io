#!/usr/bin/env node
// channels/daily-reports/ingest.mjs — pulls fresh reports from HF
// kaidjuric/daily-pipeline-director-cut into the hub.
//
// Usage: node channels/daily-reports/ingest.mjs [--dry-run]
//
// Reads HF tree API for file list under data/.
// Fetches any HTML files newer than what we already have.
// Writes to channels/daily-reports/{date}-{slug}.html
// Updates channels/daily-reports/index.html with the feed.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');  // kajica2-instance root
const REPORTS_DIR = __dirname;

const DRY_RUN = process.argv.includes('--dry-run');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractDate(filename) {
  const m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function extractSlug(filename) {
  // Strip leading dir prefix (e.g. 'data/'), leading date prefix, and .html suffix
  const noDir = filename.replace(/^[^/]+\//, '');
  return noDir.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.html$/, '');
}

async function main() {
  console.log(`[ingest] dry-run=${DRY_RUN}`);

  // Fetch tree
  const treeUrl = 'https://huggingface.co/api/spaces/kaidjuric/daily-pipeline-director-cut/tree/main/data';
  const files = await fetchJson(treeUrl);
  const htmlFiles = files
    .filter(f => f.type === 'file' && f.path.endsWith('.html'))
    .map(f => f.path);

  console.log(`[ingest] ${htmlFiles.length} HTML files in HF data/`);

  // Existing files in our channel
  const existing = new Set(readdirSync(REPORTS_DIR).filter(f => f.endsWith('.html') && f !== 'index.html'));
  console.log(`[ingest] ${existing.size} existing reports on hub`);

  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  const allReports = [];

  for (const relpath of htmlFiles) {
    const date = extractDate(relpath);
    if (!date) {
      console.warn(`  skip ${relpath}: no date`);
      continue;
    }
    const slug = extractSlug(relpath);
    const localName = `${date}-${slug}.html`;
    if (existing.has(localName)) {
      skipped++;
      allReports.push({ date, slug, path: localName, status: 'cached' });
      continue;
    }
    const url = `https://huggingface.co/spaces/kaidjuric/daily-pipeline-director-cut/resolve/main/${relpath}`;
    try {
      const body = await fetchText(url);
      if (DRY_RUN) {
        console.log(`  would write ${localName} (${body.length} chars)`);
      } else {
        writeFileSync(join(REPORTS_DIR, localName), body);
        console.log(`  ✓ ${localName} (${body.length} chars)`);
        ingested++;
      }
      allReports.push({ date, slug, path: localName, status: 'new' });
    } catch (e) {
      console.error(`  ✗ ${relpath}: ${e.message}`);
      failed++;
    }
  }

  // Rebuild index.html (always — shows current state)
  allReports.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

  const links = allReports.map(r => `
    <a href="${r.path}" style="display:block;padding:.75rem;background:#0a0f17;border:1px solid #1a2533;border-radius:6px;margin-bottom:.5rem;color:#00e5ff;text-decoration:none;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="color:#d6e1f0;font-weight:500;">${r.date}</span>
        <span style="color:#6b7d96;font-size:.85rem;">${r.slug}</span>
      </div>
      <div style="color:#5cffa0;font-size:.7rem;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">${r.status}</div>
    </a>
  `).join('');

  const today = new Date().toISOString().split('T')[0];
  const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daily Reports — Sovereign Signal</title>
<style>
  body{font:14px/1.6 -apple-system,system-ui,sans-serif;background:#04060a;color:#d6e1f0;padding:2rem;max-width:900px;margin:0 auto;}
  h1{color:#00e5ff;margin-bottom:.5rem;}
  h1::before{content:"";display:inline-block;width:24px;height:1px;background:#ff3df0;margin-right:12px;vertical-align:middle;}
  .meta{color:#6b7d96;font-size:.85rem;margin-bottom:2rem;}
  .empty{padding:2rem;text-align:center;color:#6b7d96;border:1px dashed #1a2533;border-radius:6px;}
  nav.breadcrumb{margin-bottom:1rem;font-size:.85rem;color:#6b7d96;}
  nav.breadcrumb a{color:#6b7d96;}
  nav.breadcrumb a:hover{color:#00e5ff;}
  a{color:inherit;}
</style>
</head>
<body>
<nav class="breadcrumb"><a href="../../">hub</a> › / channels/daily-reports</nav>
<h1>Daily Reports</h1>
<p class="meta">Long-horizon daily research, fetched from <code>kaidjuric/daily-pipeline-director-cut</code> on Hugging Face. Each report is a self-contained HTML file. ${allReports.length} ingested as of ${today}.</p>
<div>
${links || '<div class="empty"><p>No reports yet.</p></div>'}
</div>
</body>
</html>
`;

  if (!DRY_RUN) {
    writeFileSync(join(REPORTS_DIR, 'index.html'), indexHtml);
    console.log(`[ingest] index.html updated (${allReports.length} reports)`);
  }
  console.log(`[ingest] done: ${ingested} new, ${skipped} cached, ${failed} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
