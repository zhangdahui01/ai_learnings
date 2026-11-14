/**
 * BDD layer: the Markdown spec is the source, the test is its implementation.
 *
 * A spec is `specs/<id>.md` with front matter (id, service, journey, tags) and Given / When /
 * Then / Cleanup sections whose bullet lines are the steps. `scenario()` reads the spec and
 * gives the test one function per phase. Every step the test runs must be a line of the spec,
 * in spec order, and every spec line must be run: if the spec and the code drift apart the
 * test fails with SPEC_DRIFT instead of silently testing something else.
 */
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export type Phase = 'Given' | 'When' | 'Then' | 'Cleanup';
export interface Spec { id: string; meta: Record<string, string>; tags: string[]; steps: { phase: Phase; text: string }[] }

const PHASES: Phase[] = ['Given', 'When', 'Then', 'Cleanup'];

export function loadSpec(id: string): Spec {
  const file = path.join(__dirname, '..', 'specs', `${id}.md`);
  const raw = fs.readFileSync(file, 'utf8');
  const meta: Record<string, string> = {};
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  for (const line of fm ? fm[1].split('\n') : []) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  const steps: Spec['steps'] = [];
  let phase: Phase | null = null;
  for (const line of raw.slice(fm ? fm[0].length : 0).split('\n')) {
    const head = line.match(/^#+\s*(\w+)/);
    if (head) { phase = (PHASES as string[]).includes(head[1]) ? (head[1] as Phase) : null; continue; }
    const bullet = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
    if (phase && bullet) steps.push({ phase, text: bullet[1] });
  }
  if (meta.id !== id) throw new Error(`SPEC_DRIFT: specs/${id}.md declares id '${meta.id}'`);
  for (const p of ['Given', 'When', 'Then'] as Phase[]) {
    if (!steps.some(s => s.phase === p)) throw new Error(`SPEC_INVALID: specs/${id}.md has no ${p} step`);
  }
  return { id, meta, tags: (meta.tags || '').split(/\s+/).filter(Boolean), steps };
}

type StepFn = (text: string, body: () => Promise<void>) => Promise<void>;
export interface Bdd { Given: StepFn; When: StepFn; Then: StepFn; Cleanup: StepFn }

function makeBdd(spec: Spec, info: TestInfo): { bdd: Bdd; finish: () => void } {
  let cursor = 0;
  const step = (phase: Phase): StepFn => async (text, body) => {
    const expected = spec.steps[cursor];
    if (!expected || expected.phase !== phase || expected.text !== text) {
      throw new Error(`SPEC_DRIFT in ${spec.id}: test runs "${phase} ${text}" but the spec's next step is ` +
        (expected ? `"${expected.phase} ${expected.text}"` : 'nothing (the spec has ended)'));
    }
    cursor += 1;
    await base.step(`${phase} ${text}`, body);
  };
  return {
    bdd: { Given: step('Given'), When: step('When'), Then: step('Then'), Cleanup: step('Cleanup') },
    finish: () => {
      if (info.status === info.expectedStatus && cursor < spec.steps.length) {
        const s = spec.steps[cursor];
        throw new Error(`SPEC_DRIFT in ${spec.id}: spec step "${s.phase} ${s.text}" is not implemented`);
      }
    },
  };
}

export const test = base.extend<{ bddFor: (spec: Spec) => Bdd }>({
  bddFor: async ({}, use, info) => {
    let finish = () => {};
    await use(spec => { const made = makeBdd(spec, info); finish = made.finish; return made.bdd; });
    finish();
  },
});

/** Declare one test for one spec. Tags from the spec (@gated, @P0, @payment ...) become test tags. */
export function scenario(id: string, body: (ctx: { page: Page; bdd: Bdd; spec: Spec }) => Promise<void>): void {
  const spec = loadSpec(id);
  test(`${spec.meta.title || id}`, { tag: spec.tags, annotation: [
    { type: 'spec', description: `specs/${id}.md` },
    { type: 'journey', description: spec.meta.journey || '' },
    { type: 'service', description: spec.meta.service || '' },
  ] }, async ({ page, bddFor }) => {
    await body({ page, bdd: bddFor(spec), spec });
  });
}

export { expect };
