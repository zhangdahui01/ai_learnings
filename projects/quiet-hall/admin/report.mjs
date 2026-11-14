// Turns the raw visit log into what the dashboard shows. Pure: used by the page and by the tests.
// Days are the viewer's local days.
const ENTRIES = new Set(['visit', 'register', 'login']);
export const EVENT_NAMES = {
  visit: '游客入寺', register: '注册', login: '凭口令回寺', login_failed: '口令输错', sit: '入坐', stand: '起身', bow: '合十',
  knock: '敲木鱼', prostrate: '礼拜', beads: '念珠', trial_held: '守住考验', trial_lost: '被逐出寺', history: '看功德记录', leave: '离寺',
};
const FEATURES = ['knock', 'beads', 'prostrate', 'sit', 'bow', 'trial_held', 'trial_lost', 'history', 'register', 'login'];

const pad = n => String(n).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const clock = iso => { const d = new Date(iso); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const place = e => [e.country, e.region, e.city].filter(Boolean).join(' · ') || '未知';
const times = e => (['knock', 'beads', 'prostrate'].includes(e.event) ? Math.max(1, Number(e.detail?.count) || 1) : 1);

export function describe(e) {
  const d = e.detail ?? {};
  const merit = typeof d.merit === 'number' && d.merit !== 0 ? `功德 ${d.merit > 0 ? '+' : ''}${d.merit}` : '';
  switch (e.event) {
    case 'knock': case 'beads': case 'prostrate': return [`${times(e)} 次`, merit].filter(Boolean).join('，');
    case 'trial_held': case 'trial_lost': return [d.kind === 'dog' ? '野狗' : d.kind === 'fairies' ? '仙女' : '', merit].filter(Boolean).join('，');
    case 'visit': case 'register': case 'login': return `第 ${d.visits ?? 1} 次来，功德 ${d.merit ?? 0}`;
    case 'sit': return d.seat == null ? '' : `蒲团 ${d.seat}`;
    case 'bow': return d.to === 'all' ? '向大众' : `向 ${d.to ?? ''}`;
    case 'leave': return `共坐 ${Math.round((d.seconds ?? 0) / 60)} 分钟，功德 ${d.merit ?? 0}`;
    default: return '';
  }
}

/** events: newest first. Returns totals, one row per local day (oldest first), feature use, and one row per visitor. */
export function summarize(events, { days = 30, now = new Date() } = {}) {
  const byDay = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    byDay.set(dayKey(d), { day: dayKey(d), visits: 0, people: new Set(), actions: 0 });
  }
  const features = Object.fromEntries(FEATURES.map(f => [f, 0]));
  const people = new Map(), places = new Map(), devices = new Map();
  let visits = 0, registrations = 0;

  for (const e of events) {
    const who = e.handle || '（未知）';
    const day = byDay.get(dayKey(new Date(e.at)));
    if (day) { day.actions += 1; day.people.add(who); if (ENTRIES.has(e.event)) day.visits += 1; }
    if (ENTRIES.has(e.event)) visits += 1;
    if (e.event === 'register') registrations += 1;
    if (e.event in features) features[e.event] += times(e);
    if (e.event === 'login_failed') continue;                       // someone guessing a code is not that monk
    let p = people.get(who);
    if (!p) { p = { handle: who, name: e.name ?? '', registered: false, first: e.at, last: e.at, visits: 0, actions: 0, merit: null, place: place(e), device: e.device ?? '' }; people.set(who, p); }
    if (e.at < p.first) p.first = e.at;
    if (e.at > p.last) { p.last = e.at; p.place = place(e); p.device = e.device ?? ''; }
    p.registered ||= !!e.registered; p.actions += 1;
    if (ENTRIES.has(e.event)) {
      p.visits += 1;
      places.set(place(e), (places.get(place(e)) ?? 0) + 1);
      devices.set(e.device || '未知', (devices.get(e.device || '未知') ?? 0) + 1);
    }
  }
  const top = map => [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const visitors = [...people.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
  return {
    totals: { visits, visitors: visitors.length, registered: visitors.filter(v => v.registered).length, registrations, actions: events.length },
    daily: [...byDay.values()].map(d => ({ day: d.day, visits: d.visits, visitors: d.people.size, actions: d.actions })),
    features: FEATURES.map(f => ({ key: f, label: EVENT_NAMES[f], value: features[f] })).sort((a, b) => b.value - a.value),
    places: top(places), devices: top(devices), visitors,
  };
}
