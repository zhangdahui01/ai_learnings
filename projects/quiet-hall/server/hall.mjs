// Hall state: who is in the hall, where they sit, how long they have sat. No chat, by design.
import { randomBytes, createHash } from 'node:crypto';

const FIRST = ['清', '明', '静', '慧', '净', '悟', '圆', '觉', '安', '定', '慈', '善', '宁', '澄', '朴', '恒'];
const SECOND = ['风', '月', '云', '山', '水', '松', '莲', '石', '泉', '竹', '心', '尘', '舟', '灯', '雪', '远'];
const SKIN = ['#f6d9bd', '#eec7a4', '#e0b089', '#c98f66', '#f9e2cf'];
const ROBE = ['#b5651d', '#8a4b2a', '#c98a2b', '#6b6e5a', '#7d3c2c', '#a8722f', '#5f6f7a'];
export const AWAY_AFTER_MS = 90_000;      // no heartbeat for this long: the monk has left the hall
export const HANDLE = /^[\p{L}\p{N}_-]{2,16}$/u;
export const GUEST_KEPT_MS = 6 * 3600_000; // an unregistered visitor who has left is forgotten after this long
const LEDGER_KEPT = 100;                   // merit changes remembered per monk
const LOCK_AFTER = 5, LOCK_MS = 5 * 60_000; // wrong return codes before a pause
// What each practice is worth in merit.
export const WORTH = { knock: 1, beads: 1, prostrate: 3, held: 10, lost: -20 };
const TRIAL_NAME = { dog: '野狗', fairies: '仙女' };

// Only a hash of each token is kept, so reading the stored hall does not let anyone enter as someone else.
const digest = token => createHash('sha256').update(String(token)).digest('hex');

function pick(list, n) { return list[n % list.length]; }

// Everything about a monk's look comes from the handle, so the same person is always the same monk.
export function monkFor(handle) {
  const h = createHash('sha256').update(handle.toLowerCase()).digest();
  return {
    name: pick(FIRST, h[0]) + pick(SECOND, h[1]),
    gender: h[2] % 2 === 0 ? 'm' : 'f',
    look: { skin: pick(SKIN, h[3]), robe: pick(ROBE, h[4]), face: h[5] % 4, beads: h[6] % 3 === 0 },
  };
}

export class Hall {
  constructor({ now = () => Date.now(), state } = {}) {
    this.now = now;
    this.monks = new Map();          // handle (lower case) -> monk
    for (const m of state?.monks ?? []) this.monks.set(m.handle.toLowerCase(), m);
  }

  toJSON() { return { monks: [...this.monks.values()] }; }

  #present(m) { return m.resident || (m.inHall && this.now() - m.lastSeen < AWAY_AFTER_MS); }

  // People who stopped sending heartbeats stand up (their sitting time is kept) and free their cushion.
  // Unregistered visitors who left long ago are forgotten, so the hall's record does not grow without end.
  sweep() {
    for (const [key, m] of this.monks) {
      if (m.resident) continue;
      if (m.inHall && this.now() - m.lastSeen >= AWAY_AFTER_MS) this.#leave(m, m.lastSeen);
      if (!m.inHall && !m.registered && this.now() - m.lastSeen >= GUEST_KEPT_MS) this.monks.delete(key);
    }
  }

  #freeSeat() {
    const taken = new Set([...this.monks.values()].filter(m => this.#present(m)).map(m => m.seat));
    let seat = 0;
    while (taken.has(seat)) seat += 1;
    return seat;
  }

  #stand(m, at = this.now()) {
    if (m.sitting) m.totalSeconds += Math.max(0, Math.round((at - m.sitSince) / 1000));
    m.sitting = false; m.sitSince = null;
  }

  #leave(m, at) { this.#stand(m, at); m.inHall = false; m.seat = null; m.pos = null; }

  #create(handle, extra = {}) {
    const token = randomBytes(18).toString('hex');
    const m = { handle, tokenHash: digest(token), ...monkFor(handle), seat: null, inHall: false,
                sitting: false, sitSince: null, totalSeconds: 0, bows: 0, joinedAt: this.now(), lastSeen: this.now(), ...extra };
    this.monks.set(handle.toLowerCase(), m);
    return { m, token };
  }

  #enter(m) {
    if (!this.#present(m)) { m.seat = this.#freeSeat(); m.inHall = true; }
    m.lastSeen = this.now();
    m.visits = (m.visits ?? 0) + 1;
  }

  // Keep an ID for good. The return code is random, shown once, and only its hash is stored; it is what
  // lets the same person come back on another device.
  register(handle) {
    if (typeof handle !== 'string' || !HANDLE.test(handle)) return { status: 400, error: 'ID 需为 2–16 位的字母、数字、汉字、下划线或短横线' };
    this.sweep();
    if (this.monks.has(handle.toLowerCase())) return { status: 409, error: '这个 ID 已被注册，请换一个，或用回寺口令回来' };
    const code = randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-');
    const { m, token } = this.#create(handle, { registered: true, codeHash: digest(code), registeredAt: this.now() });
    this.#enter(m);
    return { status: 200, token, code, me: this.view(m) };
  }

  // Come back to a registered ID with its return code (a new device, or cleared browser data).
  login(handle, code) {
    this.sweep();
    const m = typeof handle === 'string' ? this.monks.get(handle.toLowerCase()) : null;
    if (!m || !m.registered) return { status: 404, error: '没有这个注册 ID' };
    if ((m.lockedUntil ?? 0) > this.now()) return { status: 429, error: '口令错误次数过多，请五分钟后再试' };
    const given = String(code ?? '').trim().toUpperCase();
    if (digest(given) !== m.codeHash && digest(given.replace(/^(.{5})(.{5})$/, '$1-$2')) !== m.codeHash) {
      m.failures = (m.failures ?? 0) + 1;
      if (m.failures >= LOCK_AFTER) { m.lockedUntil = this.now() + LOCK_MS; m.failures = 0; }
      return { status: 403, error: '回寺口令不对' };
    }
    m.failures = 0;
    const token = randomBytes(18).toString('hex');
    m.tokenHash = digest(token);                       // the device that held the old token is signed out
    this.#enter(m);
    return { status: 200, token, me: this.view(m) };
  }

  join(handle, token) {
    if (typeof handle !== 'string' || !HANDLE.test(handle)) return { status: 400, error: 'ID 需为 2–16 位的字母、数字、汉字、下划线或短横线' };
    this.sweep();
    const key = handle.toLowerCase();
    let m = this.monks.get(key);
    if (m && (m.resident || !token || m.tokenHash !== digest(token))) return { status: 409, error: '这个 ID 已有人在用，请换一个' };
    if (!m) ({ m, token } = this.#create(handle));
    this.#enter(m);
    return { status: 200, token, me: this.view(m) };
  }

  auth(token) {
    if (!token) return null;
    const hash = digest(token);
    for (const m of this.monks.values()) if (!m.resident && m.tokenHash === hash) return m;
    return null;
  }

  touch(m) {
    if (!this.#present(m)) { m.seat = this.#freeSeat(); m.inHall = true; }
    m.lastSeen = this.now();
  }

  // Sit on your own cushion, or on another one if `seat` names a cushion nobody else holds.
  sit(m, seat) {
    this.touch(m);
    if (Number.isInteger(seat) && seat >= 0 && seat < 5000 && seat !== m.seat) {
      const held = [...this.monks.values()].some(o => o !== m && this.#present(o) && o.seat === seat);
      if (!held) m.seat = seat;
    }
    m.pos = null;
    if (!m.sitting) { m.sitting = true; m.sitSince = this.now(); }
    return this.view(m);
  }
  stand(m) { this.touch(m); this.#stand(m); return this.view(m); }
  leave(m) { this.#leave(m, this.now()); return this.view(m); }

  // Merit goes up and down, and every change is written down with its time and its reason.
  #earn(m, delta, reason) {
    const before = m.merit ?? 0;
    m.merit = Math.max(0, before + delta);
    if (m.merit === before) return;
    m.ledger = [...(m.ledger ?? []), { at: this.now(), delta: m.merit - before, reason, total: m.merit }].slice(-LEDGER_KEPT);
  }

  // Counted practices arrive in small batches; one batch is capped so a script cannot inflate a count.
  #count(count) { return Math.min(60, Math.max(0, Math.floor(Number(count ?? 1) || 0))); }
  knock(m, count) {
    this.touch(m); const n = this.#count(count);
    if (n) { m.knocks = (m.knocks ?? 0) + n; this.#earn(m, n * WORTH.knock, `敲木鱼 ×${n}`); }
    return this.view(m);
  }
  prostrate(m, count) {
    this.touch(m); const n = this.#count(count);
    if (n) { m.prostrations = (m.prostrations ?? 0) + n; this.#earn(m, n * WORTH.prostrate, `礼拜 ×${n}`); }
    return this.view(m);
  }
  beads(m, count) {
    this.touch(m); const n = this.#count(count);
    if (n) { m.beads = (m.beads ?? 0) + n; this.#earn(m, n * WORTH.beads, `念珠 ×${n}`); }
    return this.view(m);
  }
  // A trial of composure ended: held (merit up) or lost (merit down).
  trial(m, result, kind) {
    this.touch(m);
    const who = TRIAL_NAME[kind] ?? '干扰';
    if (result === 'held') { m.trials = (m.trials ?? 0) + 1; this.#earn(m, WORTH.held, `守住考验：${who}`); }
    else if (result === 'lost') { m.lost = (m.lost ?? 0) + 1; this.#earn(m, WORTH.lost, `定力不足，被${who}扰乱`); }
    return this.view(m);
  }
  history(m) { return [...(m.ledger ?? [])].reverse(); }           // newest first

  // Walking: a standing monk may go anywhere on the hall floor. Sitting down returns the monk to the cushion.
  move(m, x, z) {
    this.touch(m);
    const ok = v => typeof v === 'number' && Number.isFinite(v);
    if (!m.sitting && ok(x) && ok(z)) m.pos = { x: Math.round(Math.max(-40, Math.min(40, x)) * 100) / 100, z: Math.round(Math.max(-400, Math.min(400, z)) * 100) / 100 };
    return this.view(m);
  }

  // A silent greeting: palms together. To one monk, or to the whole hall when `to` is omitted.
  bow(m, to) {
    this.touch(m);
    const targets = to ? [this.monks.get(String(to).toLowerCase())].filter(t => t && this.#present(t) && t !== m)
                       : [...this.monks.values()].filter(t => this.#present(t) && t !== m);
    for (const t of targets) t.bows += 1;
    return { bowedTo: targets.length };
  }

  seedResidents(count) {
    for (let i = 0; i < count; i += 1) {
      const handle = `resident-${i + 1}`;
      if (this.monks.has(handle)) continue;
      this.monks.set(handle, { handle, tokenHash: null, resident: true, ...monkFor(handle), seat: null, inHall: true,
                               sitting: true, sitSince: this.now(), totalSeconds: 0, bows: 0, joinedAt: this.now(), lastSeen: this.now() });
      this.monks.get(handle).seat = this.#freeSeat();
    }
  }

  view(m) {
    const live = m.sitting ? Math.max(0, Math.round((this.now() - m.sitSince) / 1000)) : 0;
    return { handle: m.handle, name: m.name, gender: m.gender, look: m.look, seat: m.seat, sitting: m.sitting,
             sittingSeconds: live, totalSeconds: m.totalSeconds + live, bows: m.bows, merit: m.merit ?? 0, prostrations: m.prostrations ?? 0, beads: m.beads ?? 0, trials: m.trials ?? 0,
             pos: m.sitting ? null : m.pos ?? null, resident: !!m.resident, registered: !!m.registered };
  }

  snapshot() {
    this.sweep();
    const present = [...this.monks.values()].filter(m => this.#present(m)).map(m => this.view(m)).sort((a, b) => a.seat - b.seat);
    return { now: this.now(), present: present.length, sitting: present.filter(m => m.sitting).length,
             seats: Math.max(60, (present.at(-1)?.seat ?? 0) + 21), monks: present };
  }
}
