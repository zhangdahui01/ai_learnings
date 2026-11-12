import { expect, type Page } from '@playwright/test';

/** Page object for the Quiet Hall app (web build). Locators are the app's test ids: the same contract the native app exposes. */
export class QuietHall {
  constructor(private page: Page) {}

  async openGate() { await this.page.goto('/'); await expect(this.page.getByTestId('gate.enter')).toBeVisible(); }
  /** No ID to type: the app draws a random one for every visit. */
  async enter() { await this.page.getByTestId('gate.enter').click(); }
  gateError() { return this.page.getByTestId('gate.error'); }
  enterButton() { return this.page.getByTestId('gate.enter'); }

  myName() { return this.page.getByTestId('hall.me.name'); }
  myHandle() { return this.page.getByTestId('hall.me.handle'); }
  myState() { return this.page.getByTestId('hall.me.state'); }
  timer() { return this.page.getByTestId('hall.me.timer'); }
  total() { return this.page.getByTestId('hall.me.total'); }
  merit() { return this.page.getByTestId('hall.me.merit'); }
  prostrations() { return this.page.getByTestId('hall.me.prostrations'); }
  beads() { return this.page.getByTestId('hall.me.beads'); }
  beadsInRound() { return this.page.getByTestId('beads.count'); }
  present() { return this.page.getByTestId('hall.count'); }
  sittingCount() { return this.page.getByTestId('hall.sitting'); }
  async number(of: 'present' | 'sitting'): Promise<number> {
    return Number(await (of === 'present' ? this.present() : this.sittingCount()).innerText());
  }

  async prostrate() { await this.page.getByTestId('hall.prostrate').click(); }
  async openBeads() { await this.page.getByTestId('hall.beads').click(); await expect(this.page.getByTestId('beads.panel')).toBeVisible(); }
  async turnBead() { await this.page.getByTestId('beads.bead').click(); }
  async closeBeads() { await this.page.getByTestId('beads.close').click(); await expect(this.page.getByTestId('beads.panel')).toHaveCount(0); }
  async knock() { await this.page.getByTestId('hall.knock').click(); }
  async sit() { await this.page.getByTestId('hall.sit').click(); }
  async stand() { await this.page.getByTestId('hall.stand').click(); }
  async leave() { await this.page.getByTestId('hall.leave').click(); await expect(this.enterButton()).toBeVisible(); }
}
