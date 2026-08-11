import { randomUUID } from 'node:crypto';

export function readString(source) {
  const match = String(source).trim().match(/^(['"])((?:\\.|(?!\1).)*)\1/s);
  return match ? match[2].replace(/\\(['"\\])/g, '$1') : '';
}

export function readValue(source) {
  let value = String(source).trim();
  const number = value.match(/^Number\((.*)\)$/s); if (number) value = number[1].trim();
  const resolved = value.match(/^resolveValue\((.*)\)$/s); if (resolved) value = resolved[1].trim();
  return readString(value) || value;
}

export function parseLocator(method, args) {
  const value = readString(args);
  const names = String(args).match(/name:\s*(['"])((?:\\.|(?!\1).)*)\1/s);
  const strategy = { getByRole: 'role', getByLabel: 'label', getByText: 'text', getByTestId: 'testId', getByPlaceholder: 'placeholder', getByAltText: 'altText', getByTitle: 'title', locator: 'css' }[method];
  return { primary: { strategy, value, ...(names ? { name: names[2].replace(/\\(['"\\])/g, '$1') } : {}) } };
}

export function parseCodegen(code) {
  const embedded = [...String(code).matchAll(/^\s*\/\/\s*wtr-step:([A-Za-z0-9_-]+)\s*$/gm)].map(match => {
    try { return JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')); } catch { return null; }
  }).filter(Boolean);
  if (embedded.length) return embedded;
  const steps = [];
  for (const raw of String(code).split('\n')) {
    const line = raw.trim(); let match;
    if ((match = line.match(/page\.goto\((.+?)\);?$/))) {
      steps.push({ id: randomUUID(), kind: 'action', action: 'goto', url: readValue(match[1]), timeoutMs: 10000 }); continue;
    }
    if ((match = line.match(/page\.(reload|back|forward)\(\);?$/))) { steps.push({ id: randomUUID(), kind: 'action', action: match[1], timeoutMs: 10000 }); continue; }
    if ((match = line.match(/page\.(waitForTimeout|waitForURL|waitForLoadState)\((.*)\);?$/))) { steps.push({ id: randomUUID(), kind: 'action', action: match[1], value: readValue(match[2]), timeoutMs: 10000 }); continue; }
    if ((match = line.match(/page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\.(click|dblclick|hover|focus|fill|press|check|uncheck|selectOption|clear|pressSequentially)\((.*)\);?$/))) {
      const method = match[3]; const action = method === 'pressSequentially' ? 'type' : method; const step = { id: randomUUID(), kind: 'action', action, locator: parseLocator(match[1], match[2]), timeoutMs: 10000 };
      if (!['click', 'dblclick', 'hover', 'focus', 'check', 'uncheck', 'clear'].includes(action)) step.value = readValue(match[4]);
      steps.push(step); continue;
    }
    if ((match = line.match(/page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\.waitFor\(\{\s*state:\s*['"](visible|hidden)['"]\s*\}\);?$/))) { steps.push({ id: randomUUID(), kind: 'action', action: match[3] === 'visible' ? 'waitForVisible' : 'waitForHidden', locator: parseLocator(match[1], match[2]), timeoutMs: 10000 }); continue; }
    if ((match = line.match(/expect\(page\)\.toHave(URL|Title)\((.+?)\);?$/))) {
      steps.push({ id: randomUUID(), kind: 'assertion', assertion: `toHave${match[1]}`, expected: readValue(match[2]), timeoutMs: 10000 }); continue;
    }
    if ((match = line.match(/expect\(page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\)\.(toBeVisible|toBeHidden|toBeEnabled|toBeDisabled|toBeChecked|toHaveText|toContainText|toHaveValue|toHaveCount)\((.*)\);?$/))) {
      steps.push({ id: randomUUID(), kind: 'assertion', assertion: match[3], locator: parseLocator(match[1], match[2]), expected: readValue(match[4]), timeoutMs: 10000 });
    }
  }
  return steps;
}
