// Where the hall document lives when the server runs as stateless functions.
// Supabase: two SQL functions over one row of a table that is otherwise closed (RLS on, no policies). Memory: local tests.
const memory = { state: null, version: 0 };

async function rpc(name, args) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: process.env.SUPABASE_KEY, authorization: `Bearer ${process.env.SUPABASE_KEY}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`store ${name} failed: ${res.status}`);
  return res.json();
}

export async function load() {
  if (!process.env.SUPABASE_URL) return { state: memory.state && structuredClone(memory.state), version: memory.version };
  return rpc('quiet_hall_load', {});
}

/** Returns false when someone else wrote first: reload and apply the action again. */
export async function save(state, version) {
  if (!process.env.SUPABASE_URL) {
    if (version !== memory.version) return false;
    memory.state = structuredClone(state); memory.version += 1;
    return true;
  }
  return rpc('quiet_hall_save', { p_state: state, p_version: version });
}
