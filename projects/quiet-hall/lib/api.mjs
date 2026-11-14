// The hall's API, independent of how it is served: one action in, a status, a body and (for the actions
// worth counting) a line for the visit log out. Used by the local server and by the serverless functions.
export const ROUTES = {
  health: 'GET', hall: 'GET', history: 'GET',
  join: 'POST', register: 'POST', login: 'POST',
  sit: 'POST', stand: 'POST', bow: 'POST', leave: 'POST', knock: 'POST', prostrate: 'POST', beads: 'POST', move: 'POST', trial: 'POST',
};
const HEARTBEAT_WRITE_MS = 15_000;       // polling reads the hall every 2 s; only write a heartbeat this often

const who = m => ({ handle: m.handle, name: m.name, registered: !!m.registered });

export function apply(hall, action, { token, body = {} }) {
  if (action === 'health') return { status: 200, body: { ok: true } };

  if (action === 'join' || action === 'register' || action === 'login') {
    const out = action === 'join' ? hall.join(body.handle, body.token) : action === 'register' ? hall.register(body.handle) : hall.login(body.handle, body.code);
    if (out.status !== 200) {
      return { status: out.status, body: { error: out.error },
               log: action === 'login' ? { handle: String(body.handle ?? '').slice(0, 16), event: 'login_failed', detail: { status: out.status } } : undefined };
    }
    const m = hall.auth(out.token);
    return { status: 200, body: { token: out.token, me: out.me, ...(out.code ? { code: out.code } : {}) },
             log: { ...who(m), event: action === 'join' ? 'visit' : action, detail: { visits: m.visits ?? 1, merit: m.merit ?? 0 } } };
  }

  const me = hall.auth(token);
  if (action === 'hall') {
    if (me && (!me.inHall || hall.now() - me.lastSeen > HEARTBEAT_WRITE_MS)) hall.touch(me);
    return { status: 200, body: { ...hall.snapshot(), me: me ? hall.view(me) : null } };
  }
  if (!me) return { status: 401, body: { error: '请先入寺' } };
  if (action === 'history') return { status: 200, body: { me: hall.view(me), history: hall.history(me) }, log: { ...who(me), event: 'history', detail: {} } };

  let result, detail = {};
  switch (action) {
    case 'bow': result = hall.bow(me, body.to); detail = { to: body.to ? String(body.to).slice(0, 16) : 'all', reached: result.bowedTo }; break;
    case 'knock': case 'prostrate': case 'beads': { const before = me.merit ?? 0; hall[action](me, body.count); detail = { count: Number(body.count) || 1, merit: (me.merit ?? 0) - before }; break; }
    case 'trial': { const before = me.merit ?? 0; hall.trial(me, body.result, body.kind); detail = { result: body.result, kind: body.kind, merit: (me.merit ?? 0) - before }; break; }
    case 'sit': hall.sit(me, body.seat); detail = { seat: me.seat }; break;
    case 'move': hall.move(me, body.x, body.z); break;
    case 'leave': detail = { seconds: hall.view(me).totalSeconds, merit: me.merit ?? 0 }; hall.leave(me); break;
    default: hall[action](me);                              // stand
  }
  return { status: 200, body: { ...(action === 'bow' ? result : {}), me: hall.view(me) },
           log: action === 'move' ? undefined : { ...who(me), event: action === 'trial' ? `trial_${body.result}` : action, detail } };
}
