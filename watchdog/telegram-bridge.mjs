#!/usr/bin/env node
// watchdog/telegram-bridge.mjs — minimal Telegram Bot API client.
//
// Uses fetch() to api.telegram.org. No CLI install. Falls back to iMessage
// (osascript) if Telegram isn't configured or send fails.
//
// Configuration:
//   ~/.hermes/config.yaml must have:
//     telegram:
//       bot_token: <token from @BotFather>
//       chat_id:   <your chat id>
//   OR set env vars:
//     TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
//
// Imessage fallback: always works on macOS (uses osascript). Sends to
// yourself (Messages.app must be signed in).

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || readTelegramConfig('bot_token');
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || readTelegramConfig('chat_id');

function readTelegramConfig(key) {
  const cfgPath = `${homedir()}/.hermes/config.yaml`;
  if (!existsSync(cfgPath)) return null;
  const text = readFileSync(cfgPath, 'utf8');
  // Crude YAML parse — we know the shape: `telegram:\n  bot_token: xxx`
  const m = text.match(new RegExp(`telegram:[\\s\\S]*?${key}:\\s*['"]?([^\\s'"]+)`));
  return m ? m[1] : null;
}

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    return { ok: false, channel: 'telegram', error: 'telegram not configured' };
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: CHAT_ID,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await res.json();
    if (data.ok) return { ok: true, channel: 'telegram' };
    return { ok: false, channel: 'telegram', error: data.description || 'unknown' };
  } catch (e) {
    return { ok: false, channel: 'telegram', error: String(e).slice(0, 200) };
  }
}

function sendIMessage(text) {
  // macOS-only. Uses AppleScript to send via Messages.app.
  // On non-macOS (Linux runners, CI), returns a clean "not available" error.
  if (process.platform !== 'darwin') {
    return { ok: false, channel: 'imessage', error: 'imessage only available on macOS' };
  }
  const buddy = process.env.IMESSAGE_BUDDY || 'kai@djuric.local';
  // Flatten newlines so AppleScript quoting doesn't break.
  const flattened = text.replace(/\r?\n/g, ' / ');
  const escaped = flattened.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "Messages" to send \"${escaped}\" to buddy \"${buddy}\"`;
  try {
    execSync(`osascript -e ${JSON.stringify(script)}`, { timeout: 8000 });
    return { ok: true, channel: 'imessage' };
  } catch (e) {
    return { ok: false, channel: 'imessage', error: String(e).slice(0, 200) };
  }
}

export async function sendMessage(text) {
  // Try Telegram first; if not configured or fails, fall back to iMessage.
  const tg = await sendTelegram(text);
  if (tg.ok) return tg;
  // Telegram failed — try iMessage as fallback
  const im = sendIMessage(text);
  if (im.ok) return im;
  // Both failed — return the better error
  return tg.error ? tg : im;
}

// If run directly, accept a message from stdin and send it
if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv.slice(2).join(' ') || '';
  if (!text) {
    console.error('Usage: telegram-bridge.mjs <message>');
    process.exit(2);
  }
  const r = await sendMessage(text);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
