/**
 * Page object for 云灯岛. Locators go through support/strict.ts (0 -> wait, 1 -> act, >1 -> fail).
 * The game's own state is read through window.__game, which the page always exposes.
 */
import { expect, type Page, type Route } from '@playwright/test';
import * as path from 'path';
import { strict, by } from '../support/strict';

const THREE_DIR = path.join(__dirname, '..', 'node_modules', 'three');

/** In-memory stand-in for the Supabase RPC endpoints, with the same contract as the real functions. */
export class FakeBackend {
  users = new Map<string, { name: string; pw: string }>();
  sessions = new Map<string, string>();
  saves: { id: number; user: string; kind: string; label: string; done_count: number; state: any; created_at: string }[] = [];
  private seq = 0; private clock = Date.now();
  private who(t: string) { const u = this.sessions.get(t); if (!u) throw new Error('NOT_LOGGED_IN'); return u; }
  private session(u: string) { const t = `${++this.seq}`.padStart(64, 'f'); this.sessions.set(t, u); return t; }
  call(fn: string, a: any): any {
    const key = String(a.p_username ?? '').trim().toLowerCase();
    switch (fn) {
      case 'game_register':
        if (!/^[A-Za-z0-9_一-鿿]{2,20}$/.test(String(a.p_username).trim())) throw new Error('BAD_USERNAME');
        if (String(a.p_password ?? '').length < 6) throw new Error('BAD_PASSWORD');
        if (this.users.has(key)) throw new Error('USERNAME_TAKEN');
        this.users.set(key, { name: a.p_username.trim(), pw: a.p_password });
        return { token: this.session(key), username: a.p_username.trim() };
      case 'game_login': {
        const u = this.users.get(key);
        if (!u || u.pw !== a.p_password) return { error: 'BAD_LOGIN' };
        return { token: this.session(key), username: u.name };
      }
      case 'game_logout': this.sessions.delete(a.p_token); return null;
      case 'game_save': {
        const user = this.who(a.p_token);
        const done_count = (a.p_state.done || []).filter(Boolean).length;
        const s = { id: ++this.seq, user, kind: a.p_kind, label: a.p_label || '', done_count, state: a.p_state, created_at: new Date(this.clock += 1000).toISOString() };
        this.saves.push(s); return { id: s.id, created_at: s.created_at, done_count };
      }
      case 'game_list_saves': { const user = this.who(a.p_token);
        return this.saves.filter(s => s.user === user).sort((x, y) => y.id - x.id).map(({ id, kind, label, done_count, created_at }) => ({ id, kind, label, done_count, created_at })); }
      case 'game_load_save': { const user = this.who(a.p_token);
        const s = this.saves.find(v => v.id === a.p_id && v.user === user); if (!s) throw new Error('SAVE_NOT_FOUND'); return s.state; }
    }
    throw new Error('UNKNOWN_FN');
  }
  async handle(route: Route) {
    const fn = route.request().url().split('/rpc/')[1];
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(this.call(fn, route.request().postDataJSON())) }); }
    catch (e: any) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }); }
  }
}

export class Island {
  readonly errors: string[] = [];
  constructor(readonly page: Page, readonly backend = new FakeBackend()) {}

  async open() {
    this.page.on('pageerror', e => this.errors.push(String(e)));
    await this.page.route('**/*', async route => {
      const u = route.request().url();
      if (u.includes('/rest/v1/rpc/')) return this.backend.handle(route);
      if (u.includes('three.min.js')) return route.fulfill({ path: path.join(THREE_DIR, 'build/three.min.js'), contentType: 'application/javascript' });
      if (u.includes('three@0.128.0/')) return route.fulfill({ path: path.join(THREE_DIR, u.split('three@0.128.0/')[1]), contentType: 'application/javascript' });
      if (u.startsWith('http://127.0.0.1')) return route.continue();
      return route.abort();
    });
    await this.page.goto('/?test=1');
    await expect.poll(() => this.page.evaluate(() => !!(window as any).__game)).toBe(true);
  }
  private one(id: string) { return strict(id, [by.testId(this.page, id)]); }
  async click(id: string) { await (await this.one(id)).click(); }
  async loc(id: string) { return this.one(id); }
  dialog() { return this.page.getByTestId('dialog'); }
  progress() { return this.page.getByTestId('progress'); }

  /** Tap the scene (not the dialog box) until the dialog has been read through. */
  async readDialog() {
    await expect(this.dialog()).toBeVisible();
    for (let i = 0; i < 20 && await this.dialog().isVisible(); i++) { await this.page.touchscreen.tap(200, 250); await this.page.waitForTimeout(250); }
    await expect(this.dialog()).toBeHidden();
  }
  async startNewGame() { await this.click('start'); await this.readDialog(); }
  pos() { return this.page.evaluate(() => { const p = (window as any).__game.player.position; return { x: p.x as number, z: p.z as number }; }); }
  async standAt(x: number, z: number) {
    await this.page.evaluate(([x, z]) => { const g = (window as any).__game; g.S.moveTo = null; g.player.position.set(x, g.H(x, z), z); g.dog.position.set(x + 1.5, g.H(x + 1.5, z + 1), z + 1); }, [x, z]);
  }
  async act(label: RegExp) {
    const b = await this.one('act');
    await expect(b).toHaveText(label);
    await b.click();
  }
  /** Hold the on-screen joystick pushed in a direction, with real touch events. */
  async pushJoystick(dx: number, dy: number, ms: number) {
    const box = (await this.page.locator('#joy').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const cdp = await this.page.context().newCDPSession(this.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + dx * i / 5, y: cy + dy * i / 5 }] });
    await this.page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async register(name: string, pw: string) {
    await (await this.one('username')).fill(name); await (await this.one('password')).fill(pw); await this.click('register');
  }
  async login(name: string, pw: string) {
    await (await this.one('username')).fill(name); await (await this.one('password')).fill(pw); await this.click('login');
  }
}
