import { randomUUID } from 'node:crypto';

export function readString(source) {
  const match = String(source).trim().match(/^(['"])((?:\\.|(?!\1).)*)\1/s);
  return match ? match[2].replace(/\\(['"\\])/g, '$1') : '';
}

export function readValue(source) {
  let value = String(source).trim();
  const number = value.match(/^Number\((.*)\)$/s); if (number) value = number[1].trim();
  const resolved = value.match(/^resolveValue\((.*)\)$/s); if (resolved) value = resolved[1].trim();
  if (value.startsWith('[') && value.endsWith(']')) { const items=splitArguments(value.slice(1,-1));if(items.every(item=>readString(item)))return JSON.stringify(items.map(item=>readString(item))); }
  return readString(value) || value;
}

export function parseLocator(method, args) {
  const value = readString(args);
  const names = String(args).match(/name:\s*(['"])((?:\\.|(?!\1).)*)\1/s);
  const exact = /\bexact:\s*true\b/.test(String(args));
  const strategy = { getByRole: 'role', getByLabel: 'label', getByText: 'text', getByTestId: 'testId', getByPlaceholder: 'placeholder', getByAltText: 'altText', getByTitle: 'title', locator: 'css' }[method];
  return { primary: { strategy, value, ...(exact ? { operator: 'equals' } : {}), ...(names ? { name: names[2].replace(/\\(['"\\])/g, '$1') } : {}) } };
}

function splitArguments(source) {
  const parts = []; let quote = ''; let escaped = false; let depth = 0; let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === quote) quote = ''; continue; }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if ('([{'.includes(character)) depth += 1; else if (')]}'.includes(character)) depth -= 1;
    else if (character === ',' && depth === 0) { parts.push(source.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(source.slice(start).trim()); return parts.filter(Boolean);
}

function readCall(source, start, method) {
  const prefix = `.${method}(`;
  if (!source.startsWith(prefix, start)) return null;
  const argsStart = start + prefix.length; let quote = ''; let escaped = false; let depth = 1;
  for (let index = argsStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if (character === '(') depth += 1;
    else if (character === ')' && --depth === 0) return { args: source.slice(argsStart, index), end: index + 1 };
  }
  return null;
}

function parsePageTarget(expression) {
  const source = String(expression).trim(); if (!source.startsWith('page')) return null;
  const framePath = []; let cursor = 4;
  while (cursor < source.length) {
    const frame = readCall(source, cursor, 'frameLocator');
    if (frame) { const selector = readString(frame.args); if (!selector) return null; framePath.push(selector); cursor = frame.end; continue; }
    const locatorFrame = readCall(source, cursor, 'locator');
    if (locatorFrame && source.startsWith('.contentFrame()', locatorFrame.end)) { const selector = readString(locatorFrame.args); if (!selector) return null; framePath.push(selector); cursor = locatorFrame.end + '.contentFrame()'.length; continue; }
    break;
  }
  for (const method of ['getByRole','getByLabel','getByText','getByTestId','getByPlaceholder','getByAltText','getByTitle','locator']) {
    const target = readCall(source, cursor, method);
    if (target) return { framePath, method, args: target.args, tail: source.slice(target.end) };
  }
  return null;
}

function frameValue(framePath) { return framePath.length === 1 ? framePath[0] : JSON.stringify(framePath); }

export function parseCodegen(code) {
  const embedded = [...String(code).matchAll(/^\s*\/\/\s*(?:wtr-phase:(setup|steps|teardown)\s+)?wtr-step:([A-Za-z0-9_-]+)\s*$/gm)].map(match => {
    try { return JSON.parse(Buffer.from(match[2], 'base64url').toString('utf8')); } catch { return null; }
  }).filter(Boolean);
  if (embedded.length) return embedded;
  const steps = []; let activeFrame = null;
  const applyFrame = framePath => {
    const key = framePath.length ? JSON.stringify(framePath) : null;
    if (key === activeFrame) return;
    steps.push(framePath.length
      ? { id: randomUUID(), kind: 'action', action: 'switchFrame', value: frameValue(framePath), timeoutMs: 10000 }
      : { id: randomUUID(), kind: 'action', action: 'switchMainFrame', timeoutMs: 10000 });
    activeFrame = key;
  };
  for (const raw of String(code).split('\n')) {
    const line = raw.trim(); let match;
    if ((match = line.match(/page\.goto\((.+?)\);?$/))) {
      applyFrame([]);
      steps.push({ id: randomUUID(), kind: 'action', action: 'goto', url: readValue(match[1]), timeoutMs: 10000 }); continue;
    }
    if ((match = line.match(/page\.(reload|back|forward)\(\);?$/))) { applyFrame([]); steps.push({ id: randomUUID(), kind: 'action', action: match[1], timeoutMs: 10000 }); continue; }
    if ((match = line.match(/page\.(waitForTimeout|waitForURL|waitForLoadState)\((.*)\);?$/))) { applyFrame([]); steps.push({ id: randomUUID(), kind: 'action', action: match[1], value: readValue(match[2]), timeoutMs: 10000 }); continue; }
    const target = parsePageTarget(line.replace(/^await\s+/, ''));
    if (target && (match = target.tail.match(/^\.(click|dblclick|tap|hover|focus|fill|press|check|uncheck|selectOption|clear|pressSequentially|setInputFiles|selectText)\((.*)\);?$/))) {
      applyFrame(target.framePath);
      const method = match[1]; const rightClick = method === 'click' && /\bbutton:\s*['"]right['"]/.test(match[2]); const action = rightClick ? 'rightClick' : method === 'pressSequentially' ? 'type' : method; const step = { id: randomUUID(), kind: 'action', action, locator: parseLocator(target.method, target.args), timeoutMs: 10000 };
      if (!['click', 'rightClick', 'dblclick', 'tap', 'hover', 'focus', 'check', 'uncheck', 'clear', 'selectText'].includes(action)) step.value = readValue(match[2]);
      steps.push(step); continue;
    }
    if (target && (match = target.tail.match(/^\.waitFor\(\{\s*state:\s*['"](visible|hidden)['"]\s*\}\);?$/))) { applyFrame(target.framePath); steps.push({ id: randomUUID(), kind: 'action', action: match[1] === 'visible' ? 'waitForVisible' : 'waitForHidden', locator: parseLocator(target.method, target.args), timeoutMs: 10000 }); continue; }
    if ((match = line.match(/expect\(page\)\.toHave(URL|Title)\((.+?)\);?$/))) {
      applyFrame([]);
      steps.push({ id: randomUUID(), kind: 'assertion', assertion: `toHave${match[1]}`, expected: readValue(match[2]), timeoutMs: 10000 }); continue;
    }
    if ((match = line.match(/^await\s+expect\((page.+)\)(\.not)?\.(toBeVisible|toBeHidden|toBeAttached|toBeEnabled|toBeDisabled|toBeEditable|toBeEmpty|toBeFocused|toBeInViewport|toBeChecked|toHaveText|toContainText|toHaveValue|toHaveValues|toHaveCount|toHaveAttribute|toHaveClass|toContainClass|toHaveCSS|toHaveId|toHaveJSProperty|toHaveAccessibleName|toHaveAccessibleDescription|toHaveAccessibleErrorMessage|toHaveRole)\((.*)\);?$/))) {
      const assertionTarget = parsePageTarget(match[1]); if (!assertionTarget) continue; applyFrame(assertionTarget.framePath); const args=splitArguments(match[4]);const named=['toHaveAttribute','toHaveCSS','toHaveJSProperty'].includes(match[3]);
      steps.push({ id: randomUUID(), kind: 'assertion', assertion: match[3], locator: parseLocator(assertionTarget.method, assertionTarget.args), ...(named?{argumentName:readValue(args[0]),expected:readValue(args[1]||'')}:{expected:readValue(args[0]||'')}), ...(match[2]?{negated:true}:{}), timeoutMs: 10000 });
    }
  }
  return steps;
}

export function parseCodegenPhases(code) {
  const matches = [...String(code).matchAll(/^\s*\/\/\s*(?:wtr-phase:(setup|steps|teardown)\s+)?wtr-step:([A-Za-z0-9_-]+)\s*$/gm)];
  if (!matches.length) return { setup: [], steps: parseCodegen(code), teardown: [], embedded: false };
  const phases = { setup: [], steps: [], teardown: [], embedded: true };
  for (const match of matches) {
    try { phases[match[1] || 'steps'].push(JSON.parse(Buffer.from(match[2], 'base64url').toString('utf8'))); } catch { /* ignore invalid metadata and preserve remaining steps */ }
  }
  return phases;
}
