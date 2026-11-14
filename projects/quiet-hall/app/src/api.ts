import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface Monk {
  handle: string; name: string; gender: 'm' | 'f';
  look: { skin: string; robe: string; face: number; beads: boolean };
  seat: number | null; sitting: boolean; sittingSeconds: number; totalSeconds: number; bows: number; merit: number; prostrations: number; beads: number; trials: number;
  pos: { x: number; z: number } | null; resident: boolean; registered: boolean;
}
export interface HallSnapshot { now: number; present: number; sitting: number; seats: number; monks: Monk[]; me: Monk | null }
export interface Session { server: string; handle: string; token: string; registered?: boolean }
/** One change of merit: when, how much, why, and the total afterwards. */
export interface MeritChange { at: number; delta: number; reason: string; total: number }

const KEY = 'quiet-hall.session';
const ACCOUNTS = 'quiet-hall.accounts';        // registered IDs this device can walk back in as: handle -> token
const PORT = 8787;

/** Where the hall server is, when nobody has typed an address: the machine this app was served or built from. */
export function defaultServer(): string {
  if (process.env.EXPO_PUBLIC_HALL_URL) return process.env.EXPO_PUBLIC_HALL_URL;
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    // deployed: the API is served from the same origin. Local: the hall server runs beside the page on its own port.
    const local = ['localhost', '127.0.0.1'].includes(location.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(location.hostname);
    return local ? `${location.protocol}//${location.hostname}:${PORT}` : location.origin;
  }
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];          // the Mac running `expo start`
  if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') return `http://${devHost}:${PORT}`;
  return Platform.OS === 'android' ? `http://10.0.2.2:${PORT}` : `http://localhost:${PORT}`;   // emulator -> host loopback
}

export class HallError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(server: string, path: string, init: { method?: string; token?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${server.replace(/\/+$/, '')}${path}`, {
      method: init.method ?? 'GET', signal: init.keepalive ? undefined : controller.signal, keepalive: init.keepalive,
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new HallError('连不上大殿，请检查服务器地址和网络', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HallError(data.error ?? `请求失败（${res.status}）`, res.status);
  return data as T;
}

export const api = {
  join: (server: string, handle: string, token?: string) =>
    call<{ token: string; me: Monk }>(server, '/api/join', { method: 'POST', body: { handle, token } }),
  register: (server: string, handle: string) => call<{ token: string; code: string; me: Monk }>(server, '/api/register', { method: 'POST', body: { handle } }),
  login: (server: string, handle: string, code: string) => call<{ token: string; me: Monk }>(server, '/api/login', { method: 'POST', body: { handle, code } }),
  history: (s: Session) => call<{ me: Monk; history: MeritChange[] }>(s.server, '/api/history', { token: s.token }),
  hall: (s: Session) => call<HallSnapshot>(s.server, '/api/hall', { token: s.token }),
  sit: (s: Session, seat?: number | null) => call<{ me: Monk }>(s.server, '/api/sit', { method: 'POST', token: s.token, body: { seat: seat ?? undefined } }),
  trial: (s: Session, result: 'held' | 'lost', kind: string) => call<{ me: Monk }>(s.server, '/api/trial', { method: 'POST', token: s.token, body: { result, kind }, keepalive: true }),
  stand: (s: Session) => call<{ me: Monk }>(s.server, '/api/stand', { method: 'POST', token: s.token }),
  bow: (s: Session, to?: string) => call<{ bowedTo: number; me: Monk }>(s.server, '/api/bow', { method: 'POST', token: s.token, body: { to } }),
  // keepalive: a batch sent while the page is closing still reaches the hall
  knock: (s: Session, count: number) => call<{ me: Monk }>(s.server, '/api/knock', { method: 'POST', token: s.token, body: { count }, keepalive: true }),
  prostrate: (s: Session, count: number) => call<{ me: Monk }>(s.server, '/api/prostrate', { method: 'POST', token: s.token, body: { count }, keepalive: true }),
  beads: (s: Session, count: number) => call<{ me: Monk }>(s.server, '/api/beads', { method: 'POST', token: s.token, body: { count }, keepalive: true }),
  move: (s: Session, x: number, z: number) => call<{ me: Monk }>(s.server, '/api/move', { method: 'POST', token: s.token, body: { x, z } }),
  leave: (s: Session) => call<{ me: Monk }>(s.server, '/api/leave', { method: 'POST', token: s.token }),
};

export const store = {
  async load(): Promise<Session | null> {
    try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  async save(s: Session) { try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch { /* the session still works for this launch */ } },
  async clear() { try { await AsyncStorage.removeItem(KEY); } catch { /* nothing to clear */ } },
  async accounts(): Promise<Record<string, string>> {
    try { return JSON.parse((await AsyncStorage.getItem(ACCOUNTS)) ?? '{}'); } catch { return {}; }
  },
  async remember(handle: string, token: string) {
    try { const all = await this.accounts(); all[handle.toLowerCase()] = token; await AsyncStorage.setItem(ACCOUNTS, JSON.stringify(all)); } catch { /* works for this visit */ }
  },
  async forget(handle: string) {
    try { const all = await this.accounts(); delete all[handle.toLowerCase()]; await AsyncStorage.setItem(ACCOUNTS, JSON.stringify(all)); } catch { /* nothing to forget */ }
  },
};
