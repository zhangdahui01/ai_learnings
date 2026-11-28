/**
 * Page object for 首尔生活助手. Locators go through support/strict.ts (0 -> wait, 1 -> act, >1 -> fail).
 * Supabase (auth and tables) and the app's own /api/scan route are answered by in-memory stand-ins
 * with the same response shapes as the real services.
 */
import { type Page, type Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { strict, by } from '../support/strict';

const PHOTO = path.join(__dirname, '..', '..', '..', '..', 'seoul-life-app', 'public', 'icon-192.png');

export interface ScanCall { scene: string; need: string; imageBytes: number; authorized: boolean }

export class FakeBackend {
  users = new Map<string, { id: string; password: string; confirmed: boolean }>();
  vocab: Record<string, unknown>[] = [];
  preferences = '';
  scanCalls: ScanCall[] = [];
  /** What /api/scan answers next: a status and a JSON body. */
  scanReply: { status: number; body: unknown } = { status: 503, body: { error: 'AI 密钥尚未配置，暂时无法识别照片' } };
  private seq = 0;

  addUser(email: string, password: string) {
    this.users.set(email, { id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`, password, confirmed: true });
  }
  private user(email: string) {
    const u = this.users.get(email)!;
    return { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-11-28T00:00:00Z' };
  }
  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  }

  async auth(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.method() === 'POST' ? (req.postDataJSON() ?? {}) : {};
    if (url.pathname.endsWith('/token')) {
      const u = this.users.get(body.email);
      if (!u || u.password !== body.password) {
        return this.json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      if (!u.confirmed) return this.json(route, 400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return this.json(route, 200, {
        access_token: `token-${u.id}`, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${u.id}`, user: this.user(body.email),
      });
    }
    if (url.pathname.endsWith('/signup')) {
      this.users.set(body.email, { id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`, password: body.password, confirmed: false });
      return this.json(route, 200, { ...this.user(body.email), confirmation_sent_at: '2026-11-28T00:00:00Z' });
    }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    return this.json(route, 404, { msg: 'not found' });
  }

  async rest(route: Route) {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/rest/v1/')[1];
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (table === 'vocab') return this.json(route, 200, this.vocab);
    if (table === 'profiles') {
      if (req.method() === 'GET') return this.json(route, 200, wantsObject ? { preferences: this.preferences } : [{ preferences: this.preferences }]);
      const body = req.postDataJSON();
      this.preferences = (Array.isArray(body) ? body[0] : body).preferences;
      return route.fulfill({ status: 201, body: '' });
    }
    return this.json(route, 404, { message: 'unknown table' });
  }

  async scan(route: Route) {
    const req = route.request();
    const body = req.postDataJSON();
    this.scanCalls.push({
      scene: body.scene, need: body.need, imageBytes: String(body.image || '').length,
      authorized: (req.headers()['authorization'] || '').startsWith('Bearer token-'),
    });
    return this.json(route, this.scanReply.status, this.scanReply.body);
  }
}

export class SeoulLife {
  readonly errors: string[] = [];
  constructor(readonly page: Page, readonly backend = new FakeBackend()) {}

  async open() {
    this.page.on('pageerror', e => this.errors.push(String(e)));
    await this.page.route('**/*', async route => {
      const u = route.request().url();
      if (u.includes('/auth/v1/')) return this.backend.auth(route);
      if (u.includes('/rest/v1/')) return this.backend.rest(route);
      if (u.includes('/api/scan')) return this.backend.scan(route);
      if (u.startsWith('http://127.0.0.1')) return route.continue();
      return route.abort();
    });
    await this.page.goto('/');
  }
  private one(id: string) { return strict(id, [by.testId(this.page, id)]); }
  async click(id: string) { await (await this.one(id)).click(); }
  async loc(id: string) { return this.one(id); }

  async login(email: string, password: string) {
    await (await this.one('email')).fill(email); await (await this.one('password')).fill(password); await this.click('submit');
  }
  /** Give the hidden camera input a real image, as the phone's camera sheet would. */
  async takePhoto() {
    await this.page.getByTestId('photo-input').setInputFiles({ name: 'shelf.png', mimeType: 'image/png', buffer: fs.readFileSync(PHOTO) });
  }
}

/** A shelf result as /api/scan returns it: item 2 is the recommended one. */
export const SHELF_RESULT = {
  scanId: 'scan-1',
  summary: '想要不辣的拌饭酱，选 2 号的酱油拌饭酱。',
  vocabCount: 2,
  items: [
    { position: 1, name_ko: '고추장', name_zh: '韩式辣椒酱', name_en: 'Gochujang', purpose: '发酵辣椒酱，偏辣。', price_krw: 4980, size_amount: 500, size_unit: 'g', promo: null, recommended: false, reason: null, unit_price_text: '每 100g 996韩元' },
    { position: 2, name_ko: '간장 비빔장', name_zh: '酱油拌饭酱', name_en: 'Soy bibim sauce', purpose: '酱油底的拌饭酱，不辣。', price_krw: 3000, size_amount: 300, size_unit: 'g', promo: '1+1', recommended: true, reason: '不辣，而且 1+1 更划算。', unit_price_text: '每 100g 500韩元（按 1+1 折算）' },
  ],
};
