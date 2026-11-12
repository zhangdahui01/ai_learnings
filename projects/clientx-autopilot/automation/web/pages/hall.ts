import { expect, type Page } from '@playwright/test';

/** Page object for the Quiet Hall app (web build). Locators are the app's test ids: the same contract the native app exposes. */
export class QuietHall {
  constructor(private page: Page) {}

  static newId(prefix = 't'): string { return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 16); }

  async openGate() { await this.page.goto('/'); await expect(this.page.getByTestId('gate.enter')).toBeVisible(); }
  async enterAs(id: string) { await this.page.getByTestId('gate.handle').fill(id); await this.page.getByTestId('gate.enter').click(); }
  gateError() { return this.page.getByTestId('gate.error'); }
  enterButton() { return this.page.getByTestId('gate.enter'); }

  myName() { return this.page.getByTestId('hall.me.name'); }
  myState() { return this.page.getByTestId('hall.me.state'); }
  timer() { return this.page.getByTestId('hall.me.timer'); }
  total() { return this.page.getByTestId('hall.me.total'); }
  present() { return this.page.getByTestId('hall.count'); }
  sittingCount() { return this.page.getByTestId('hall.sitting'); }
  async number(of: 'present' | 'sitting'): Promise<number> {
    return Number(await (of === 'present' ? this.present() : this.sittingCount()).innerText());
  }

  async sit() { await this.page.getByTestId('hall.sit').click(); }
  async stand() { await this.page.getByTestId('hall.stand').click(); }
  async leave() { await this.page.getByTestId('hall.leave').click(); await expect(this.enterButton()).toBeVisible(); }
}
