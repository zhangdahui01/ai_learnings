import { randomUUID } from 'node:crypto';

export function readString(source) {
  const match = String(source).trim().match(/^(['"])((?:\\.|(?!\1).)*)\1/s);
  return match ? match[2].replace(/\\(['"\\])/g, '$1') : '';
}

export function parseLocator(method, args) {
  const value = readString(args);
  const names = String(args).match(/name:\s*(['"])((?:\\.|(?!\1).)*)\1/s);
  const strategy = { getByRole: 'role', getByLabel: 'label', getByText: 'text', getByTestId: 'testId', getByPlaceholder: 'placeholder', getByAltText: 'altText', getByTitle: 'title', locator: 'css' }[method];
  return { primary: { strategy, value, ...(names ? { name: names[2].replace(/\\(['"\\])/g, '$1') } : {}) } };
}

export function parseCodegen(code) {
  const steps = [];
  for (const raw of String(code).split('\n')) {
    const line = raw.trim(); let match;
    if ((match = line.match(/page\.goto\((.+?)\);?$/))) {
      steps.push({ id: randomUUID(), kind: 'action', action: 'goto', url: readString(match[1]), timeoutMs: 10000 }); continue;
    }
    if ((match = line.match(/page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\.(click|dblclick|hover|fill|press|check|uncheck|selectOption|clear)\((.*)\);?$/))) {
      const action = match[3]; const step = { id: randomUUID(), kind: 'action', action, locator: parseLocator(match[1], match[2]), timeoutMs: 10000 };
      if (!['click', 'dblclick', 'hover', 'check', 'uncheck', 'clear'].includes(action)) step.value = readString(match[4]);
      steps.push(step); continue;
    }
    if ((match = line.match(/expect\(page\)\.toHave(URL|Title)\((.+?)\);?$/))) {
      steps.push({ id: randomUUID(), kind: 'assertion', assertion: `toHave${match[1]}`, expected: readString(match[2]) || match[2].trim(), timeoutMs: 10000 }); continue;
    }
    if ((match = line.match(/expect\(page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\)\.(toBeVisible|toBeHidden|toBeEnabled|toBeDisabled|toBeChecked|toHaveText|toContainText|toHaveValue|toHaveCount)\((.*)\);?$/))) {
      steps.push({ id: randomUUID(), kind: 'assertion', assertion: match[3], locator: parseLocator(match[1], match[2]), expected: readString(match[4]) || match[4].trim(), timeoutMs: 10000 });
    }
  }
  return steps;
}
