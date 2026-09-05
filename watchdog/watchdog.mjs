#!/usr/bin/env node
// watchdog/watchdog.mjs — one-step-at-a-time relay agent.
//
// Lives at the end of the rope. Wakes only on:
//   (a) delegated task completion (gh-action webhook POST)
//   (b) block detection (caller hits /watchdog/stuck endpoint)
//   (c) 8h heartbeat (cron, just says "alive")
//
// Sends ONE Telegram message (or iMessage fallback) to Kai.
// Then idles. Does not auto-loop. Does not poll.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendMessage } from './telegram-bridge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const MODE = arg('--mode', 'done');   // 'done' | 'stuck' | 'heartbeat'
const STEP = arg('--step', '?');
const SUMMARY = arg('--summary', '');
const ARTIFACTS = arg('--artifacts', '');
const HANDOFF = arg('--handoff', '');
const BLOCKED_REASON = arg('--reason', '');
const WHAT_I_TRIED = arg('--tried', '');
const WHAT_I_NEED = arg('--need', '');
const SUGGESTED_DEFAULT = arg('--default', '');

function formatMessage() {
  if (MODE === 'done') {
    return [
      `✅ [DONE] step ${STEP}`,
      SUMMARY,
      ARTIFACTS ? `\nArtifacts: ${ARTIFACTS}` : '',
      HANDOFF ? `\nHand-off: ${HANDOFF}` : '',
      `\nNext step: idle. Waiting on you.`,
    ].filter(Boolean).join('\n');
  }
  if (MODE === 'stuck') {
    return [
      `🚨 [BLOCKED] step ${STEP}`,
      BLOCKED_REASON,
      WHAT_I_TRIED ? `\nTried: ${WHAT_I_TRIED}` : '',
      WHAT_I_NEED ? `\nNeed: ${WHAT_I_NEED}` : '',
      SUGGESTED_DEFAULT ? `\nDefault if no input in 8h: ${SUGGESTED_DEFAULT}` : '',
      `\nSend instructions or "continue with default".`,
    ].filter(Boolean).join('\n');
  }
  if (MODE === 'heartbeat') {
    return [
      `💓 [HEARTBEAT] agent hub alive`,
      `Step in progress: ${STEP}`,
      SUMMARY || '(no summary this rotation)',
      `\nEverything green. No action needed unless you want to course-correct.`,
    ].filter(Boolean).join('\n');
  }
  return `[watchdog] unknown mode: ${MODE}`;
}

async function main() {
  const message = formatMessage();
  console.log(`[watchdog] mode=${MODE} step=${STEP}`);
  console.log(`[watchdog] message:\n${message}\n`);
  const result = await sendMessage(message);
  if (result.ok) {
    console.log(`[watchdog] sent via ${result.channel}`);
    process.exit(0);
  } else {
    console.error(`[watchdog] FAILED: ${result.error}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
