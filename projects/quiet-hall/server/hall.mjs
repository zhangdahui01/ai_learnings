// Hall state: who is in the hall, where they sit, how long they have sat. No chat, by design.
import { randomBytes, createHash } from 'node:crypto';

const FIRST = ['清', '明', '静', '慧', '净', '悟', '圆', '觉', '安', '定', '慈', '善', '宁', '澄', '朴', '恒'];
const SECOND = ['风', '月', '云', '山', '水', '松', '莲', '石', '泉', '竹', '心', '尘', '舟', '灯', '雪', '远'];
const SKIN = ['#f6d9bd', '#eec7a4', '#e0b089', '#c98f66', '#f9e2cf'];
const ROBE = ['#b5651d', '#8a4b2a', '#c98a2b', '#6b6e5a', '#7d3c2c', '#a8722f', '#5f6f7a'];
export const AWAY_AFTER_MS = 90_000;      // no heartbeat for this long: the monk has left the hall
export const HANDLE = /^[\p{L}\p{N}_-]{2,16}$/u;

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
  sweep() {
    for (const m of this.monks.values()) {
      if (!m.resident && m.inHall && this.now() - m.lastSeen >= AWAY_AFTER_MS) this.#leave(m, m.lastSeen);
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

  #leave(m, at) { this.#stand(m, at); m.inHall = false; m.seat = null; }

  join(handle, token) {
    if (typeof handle !== 'string' || !HANDLE.test(handle)) return { status: 400, error: 'ID 需为 2–16 位的字母、数字、汉字、下划线或短横线' };
    this.sweep();
    const key = handle.toLowerCase();
    let m = this.monks.get(key);
    if (m && (m.resident || m.token !== token)) return { status: 409, error: '这个 ID 已有人在用，请换一个' };
    if (!m) {
      m = { handle, token: randomBytes(18).toString('hex'), ...monkFor(handle), seat: null, inHall: false,
            sitting: false, sitSince: null, totalSeconds: 0, bows: 0, joinedAt: this.now(), lastSeen: this.now() };
      this.monks.set(key, m);
    }
    if (!this.#present(m)) { m.seat = this.#freeSeat(); m.inHall = true; }
    m.lastSeen = this.now();
    return { status: 200, token: m.token, me: this.view(m) };
  }

  auth(token) {
    if (!token) return null;
    for (const m of this.monks.values()) if (!m.resident && m.token === token) return m;
    return null;
  }

  touch(m) {
    if (!this.#present(m)) { m.seat = this.#freeSeat(); m.inHall = true; }
    m.lastSeen = this.now();
  }

  sit(m) { this.touch(m); if (!m.sitting) { m.sitting = true; m.sitSince = this.now(); } return this.view(m); }
  stand(m) { this.touch(m); this.#stand(m); return this.view(m); }
  leave(m) { this.#leave(m, this.now()); return this.view(m); }

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
      this.monks.set(handle, { handle, token: null, resident: true, ...monkFor(handle), seat: null, inHall: true,
                               sitting: true, sitSince: this.now(), totalSeconds: 0, bows: 0, joinedAt: this.now(), lastSeen: this.now() });
      this.monks.get(handle).seat = this.#freeSeat();
    }
  }

  view(m) {
    const live = m.sitting ? Math.max(0, Math.round((this.now() - m.sitSince) / 1000)) : 0;
    return { handle: m.handle, name: m.name, gender: m.gender, look: m.look, seat: m.seat, sitting: m.sitting,
             sittingSeconds: live, totalSeconds: m.totalSeconds + live, bows: m.bows, resident: !!m.resident };
  }

  snapshot() {
    this.sweep();
    const present = [...this.monks.values()].filter(m => this.#present(m)).map(m => this.view(m)).sort((a, b) => a.seat - b.seat);
    return { now: this.now(), present: present.length, sitting: present.filter(m => m.sitting).length,
             seats: Math.max(60, (present.at(-1)?.seat ?? 0) + 21), monks: present };
  }
}
