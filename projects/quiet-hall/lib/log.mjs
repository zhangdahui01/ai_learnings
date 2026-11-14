// The visit log: who came, and which features they used. One line per action worth counting.
// Stored in Supabase (table quiet_hall_events) when configured, otherwise in a local file or in memory.
// It records the monk's ID and name, the action, and where the request roughly came from (country, region,
// city and a browser label). It does not store IP addresses.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const memory = [];

function browser(ua = '') {
  const app = /MicroMessenger/i.test(ua) ? 'WeChat' : /KAKAOTALK/i.test(ua) ? 'KakaoTalk' : /NAVER/i.test(ua) ? 'Naver' : /Line\//i.test(ua) ? 'LINE'
    : /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'other';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'other';
  return `${app} / ${os}`;
}

const decode = v => { try { return v ? decodeURIComponent(String(v)) : null; } catch { return String(v); } };

export function describe(entry, headers = {}) {
  return {
    at: new Date().toISOString(),
    handle: entry.handle ?? null, name: entry.name ?? null, registered: !!entry.registered,
    event: entry.event, detail: entry.detail ?? {},
    country: decode(headers['x-vercel-ip-country']), region: decode(headers['x-vercel-ip-country-region']), city: decode(headers['x-vercel-ip-city']),
    device: browser(headers['user-agent']),
  };
}

/** Never throws: a failed log line must not fail the visitor's action. */
export async function record(entry, headers) {
  if (!entry) return;
  const row = describe(entry, headers);
  try {
    if (process.env.SUPABASE_URL) {
      const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/quiet_hall_log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: process.env.SUPABASE_KEY, authorization: `Bearer ${process.env.SUPABASE_KEY}` },
        body: JSON.stringify({ p_events: [row] }),
      });
      if (!res.ok) console.error('visit log failed', res.status);
    } else if (process.env.HALL_EVENTS_FILE) {
      mkdirSync(dirname(process.env.HALL_EVENTS_FILE), { recursive: true });
      appendFileSync(process.env.HALL_EVENTS_FILE, JSON.stringify(row) + '\n');
    } else {
      memory.push(row); if (memory.length > 500) memory.shift();
    }
  } catch (err) { console.error('visit log failed', err?.message); }
}
