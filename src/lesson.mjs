const CONDITIONS = [
  { key: 'highWind', name: '강풍' },
  { key: 'fog', name: '짙은 안개' },
  { key: 'closed', name: '항로 폐쇄' },
];

const OPERATORS = {
  or: { symbol: '||', name: 'OR', meaning: '하나라도 참' },
  and: { symbol: '&&', name: 'AND', meaning: '모두 참' },
};

function isOperator(value) {
  return value === 'or' || value === 'and';
}

export const SESSION_KEY = 'consolidate-conditional-expression:lesson:v1';

export function evaluateOriginal(flags) {
  if (flags.highWind) return { result: '대기', matched: 'highWind' };
  if (flags.fog) return { result: '대기', matched: 'fog' };
  if (flags.closed) return { result: '대기', matched: 'closed' };
  return { result: '출항', matched: null };
}

export function evaluateCombined(flags, operator) {
  let shouldHold;
  if (operator === 'or') {
    shouldHold = flags.highWind || flags.fog || flags.closed;
  } else if (operator === 'and') {
    shouldHold = flags.highWind && flags.fog && flags.closed;
  } else {
    throw new RangeError('알 수 없는 논리 연산자입니다.');
  }
  return shouldHold ? '대기' : '출항';
}

export function compareAllInputs(operator) {
  const rows = [];
  for (const highWind of [false, true]) {
    for (const fog of [false, true]) {
      for (const closed of [false, true]) {
        const flags = { highWind, fog, closed };
        rows.push({ flags, original: evaluateOriginal(flags).result, combined: evaluateCombined(flags, operator) });
      }
    }
  }
  return rows;
}

function defaultStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

function readSavedState(storage) {
  try {
    const saved = JSON.parse(storage.getItem(SESSION_KEY));
    if (isOperator(saved?.operator) &&
        CONDITIONS.every(({ key }) => typeof saved.flags?.[key] === 'boolean')) {
      return {
        flags: Object.fromEntries(CONDITIONS.map(({ key }) => [key, saved.flags[key]])),
        operator: saved.operator,
      };
    }
  } catch { /* The tab can still run the exercise with in-memory choices. */ }
  return { flags: { highWind: false, fog: true, closed: false }, operator: 'or' };
}

export class LessonState {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    const saved = readSavedState(storage);
    this.flags = saved.flags;
    this.operator = saved.operator;
    this.savedSnapshot = JSON.stringify(saved);
  }

  snapshot() {
    return JSON.stringify({ flags: this.flags, operator: this.operator });
  }

  get hasUnsavedState() {
    return this.snapshot() !== this.savedSnapshot;
  }

  save() {
    const snapshot = this.snapshot();
    if (snapshot === this.savedSnapshot) return;
    try {
      this.storage.setItem(SESSION_KEY, snapshot);
      this.savedSnapshot = snapshot;
    } catch { /* Keep the old snapshot so the update guard can detect pending state. */ }
  }

  setFlag(key, active) {
    if (!CONDITIONS.some(condition => condition.key === key) || typeof active !== 'boolean') return;
    this.flags[key] = active;
    this.save();
  }

  selectOperator(operator) {
    if (!isOperator(operator)) return;
    this.operator = operator;
    this.save();
  }
}

const ROUTES = {
  observe: {
    kicker: '01 / 03 · 관찰',
    title: '운항 조건 관찰하기',
    intro: '조건을 켜고 끄면서 어느 줄에서 출항 여부가 결정되는지 살펴보세요.',
  },
  combine: {
    kicker: '02 / 03 · 통합',
    title: '하나의 조건식으로 묶기',
    intro: '세 번의 대기 판단을 shouldHold로 묶어 보세요. 어떤 연산자가 원래 규칙을 지킬까요?',
  },
  verify: {
    kicker: '03 / 03 · 검증',
    title: '여덟 가지 조합 검증하기',
    intro: '세 조건의 모든 조합에서 변경 전후의 운항 판단이 일치하는지 확인하세요.',
  },
};

const BEFORE_LINES = [
  'function departure(highWind, fog, closed) {',
  "  if (highWind) return '대기';",
  "  if (fog) return '대기';",
  "  if (closed) return '대기';",
  "  return '출항';",
  '}',
];

function afterLines(operator) {
  const { symbol } = OPERATORS[operator];
  return [
    BEFORE_LINES[0],
    '  const shouldHold =',
    `    highWind ${symbol} fog ${symbol} closed;`,
    "  if (shouldHold) return '대기';",
    "  return '출항';",
    '}',
  ];
}

function el(tag, classes, ...children) {
  const node = document.createElement(tag);
  if (classes) node.className = classes;
  node.append(...children);
  return node;
}

function glyph(name, classes) {
  const paths = {
    highWind: ['M3 8h11a3 3 0 1 0-3-3', 'M2 12h16a3 3 0 1 1-3 3', 'M4 16h4a3 3 0 1 1-3 3'],
    fog: ['M5 12a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 1 1 2 8H5', 'M3 16h15', 'M6 20h15'],
    closed: ['M3 8h18v7H3z', 'm5 8-2 3m8-3-4 7m10-7-4 7', 'M6 15v5m12-5v5'],
    next: ['M4 12h15m-6-6 6 6-6 6'],
    back: ['M20 12H5m6-6-6 6 6 6'],
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor',
    'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', focusable: 'false', class: classes,
  })) svg.setAttribute(key, value);
  for (const outline of paths[name]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', outline);
    svg.append(path);
  }
  return svg;
}

function panel(classes, title, ...children) {
  return el('section', `lesson-panel ${classes}`, el('header', 'panel-header',
    el('h3', 'panel-title', title)), ...children);
}

function codeLine(line) {
  const code = el('code');
  const tokens = line.split(/('대기'|'출항'|\b(?:if|return|const|function|shouldHold|departure)\b|\|\||&&)/);
  for (const token of tokens) {
    let kind;
    if (/^(if|return|const|function)$/.test(token)) kind = 'keyword';
    else if (token.startsWith("'")) kind = 'string';
    else if (token === '||' || token === '&&') kind = 'operator';
    else if (token === 'shouldHold' || token === 'departure') kind = 'name';
    code.append(kind ? el('span', `tok-${kind}`, token) : token);
  }
  return code;
}

function codeWindow(lines, active, filename) {
  const list = el('ol', 'code-lines');
  list.setAttribute('aria-label', '자바스크립트 코드');
  for (const [index, line] of lines.entries()) {
    const lineNumber = el('span', 'line-number', String(index + 1));
    lineNumber.setAttribute('aria-hidden', 'true');
    const row = el('li', 'code-line', lineNumber, codeLine(line));
    if (index + 1 === active) {
      row.classList.add('is-active');
      row.setAttribute('aria-current', 'true');
    }
    list.append(row);
  }
  return el('div', 'code-window', el('div', 'code-header', el('span', 'code-filename', filename),
    el('span', 'code-language', 'JavaScript')), list);
}

function resultBadge(result) {
  const badge = el('span', 'result-badge', result);
  badge.dataset.result = result === '대기' ? 'hold' : 'sail';
  return badge;
}

function activeNames(flags) {
  return CONDITIONS.filter(({ key }) => flags[key]).map(({ name }) => name);
}

function conditionList(flags) {
  const list = el('div', 'condition-list');
  for (const { key, name } of CONDITIONS) {
    const control = el('button', 'condition-toggle',
      el('span', 'condition-icon', glyph(key, 'condition-glyph')),
      el('span', 'condition-copy', el('span', 'condition-name', name), el('code', 'condition-detail', key)),
      el('span', 'switch-track', el('span', 'switch-thumb')));
    control.type = 'button';
    control.dataset.flag = key;
    control.setAttribute('role', 'switch');
    control.setAttribute('aria-label', name);
    control.setAttribute('aria-checked', String(flags[key]));
    list.append(control);
  }
  return list;
}

function operatorOptions(operator) {
  const group = el('div', 'operator-options');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '논리 연산자 선택');
  for (const [value, { symbol, name, meaning }] of Object.entries(OPERATORS)) {
    const choice = el('button', 'operator-option',
      el('code', 'operator-symbol', symbol), el('span', 'operator-name', name),
      el('span', 'operator-meaning', meaning));
    choice.type = 'button';
    choice.dataset.operator = value;
    choice.setAttribute('aria-pressed', String(value === operator));
    choice.setAttribute('aria-label', `${name}, ${meaning}`);
    group.append(choice);
  }
  return group;
}

function navigationButton(route, label, primary = true) {
  const direction = primary ? 'next' : 'back';
  const icon = glyph(direction, 'lesson-btn-icon');
  const button = el('button', `lesson-btn ${primary ? 'btn-primary' : 'btn-secondary'}`,
    ...(primary ? [label, icon] : [icon, label]));
  button.type = 'button';
  button.dataset.go = route;
  return button;
}

function observe(state) {
  const { flags } = state;
  const { result, matched } = evaluateOriginal(flags);
  const index = CONDITIONS.findIndex(({ key }) => key === matched);
  const active = matched ? index + 2 : 5;
  const explanation = matched
    ? `${active}행에서 ${CONDITIONS[index].name} 조건이 처음으로 참이 되어 ‘대기’를 반환합니다.`
    : '세 조건이 모두 거짓이어서 5행에서 ‘출항’을 반환합니다.';
  const status = el('div', 'decision-strip', el('span', 'decision-label', '운항 판단'),
    el('strong', 'decision-value', result));
  status.dataset.result = result === '대기' ? 'hold' : 'sail';
  return [
    el('div', 'lesson-grid',
      panel('control-panel', '운항 조건', conditionList(flags), status),
      panel('code-panel', '변경 전 코드', codeWindow(BEFORE_LINES, active, 'departure.js'),
        el('p', 'code-note', explanation))),
    el('div', 'lesson-actions', navigationButton('combine', '조건식 묶기')),
  ];
}

function feedback(operator, rows) {
  const miss = rows.find(row => row.original !== row.combined);
  const box = el('div', 'test-feedback');
  box.dataset.tone = miss ? 'warning' : 'success';
  if (miss) {
    const names = activeNames(miss.flags).join(', ');
    box.append(el('strong', 'feedback-title', '반례를 찾았습니다'),
      el('p', 'feedback-detail', `${names} 조건만 참이면 원래 코드는 ‘${miss.original}’, ${OPERATORS[operator].name} 코드는 ‘${miss.combined}’을 반환합니다.`));
  } else {
    box.append(el('strong', 'feedback-title', '모든 조합에서 같은 결과'),
      el('p', 'feedback-detail', '하나라도 참이면 대기하고, 세 조건이 모두 거짓일 때만 출항합니다.'));
  }
  return box;
}

function combine(state) {
  const { flags, operator } = state;
  const combined = evaluateCombined(flags, operator);
  const names = activeNames(flags);
  const observation = names.length ? `켜진 조건은 ${names.join(', ')}입니다.` : '세 조건이 모두 꺼져 있습니다.';
  return [
    el('div', 'lesson-grid',
      panel('control-panel', '조건을 연결할 연산자', operatorOptions(operator),
        feedback(operator, compareAllInputs(operator))),
      panel('code-panel', '변경 후 코드', codeWindow(afterLines(operator), combined === '대기' ? 4 : 5, 'departure.js'),
        el('p', 'code-note', `${observation} 변경 전 ‘${evaluateOriginal(flags).result}’ · 변경 후 ‘${combined}’`))),
    el('div', 'lesson-actions', navigationButton('observe', '조건 관찰로', false),
      navigationButton('verify', '여덟 조합 검증하기')),
  ];
}

function comparisonTable(rows) {
  const table = el('table', 'verification-table');
  const headings = [...CONDITIONS.map(({ name }) => name), '변경 전', '변경 후', '일치 여부'];
  const header = el('tr');
  for (const label of headings) {
    const cell = el('th', '', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = el('tbody');
  for (const { flags, original, combined } of rows) {
    const match = original === combined;
    const row = el('tr');
    row.dataset.match = String(match);
    for (const { key } of CONDITIONS) {
      const marker = el('span', 'case-flag', flags[key] ? '참' : '거짓');
      marker.dataset.active = String(flags[key]);
      row.append(el('td', '', marker));
    }
    row.append(el('td', '', resultBadge(original)), el('td', '', resultBadge(combined)),
      el('td', '', el('span', 'case-state', match ? '일치' : '불일치')));
    body.append(row);
  }
  table.append(el('caption', 'sr-only', '운항 조건의 여덟 조합에 대한 변경 전후 결과'),
    el('thead', '', header), body);
  return el('div', 'table-scroll', table);
}

function verify(state) {
  const rows = compareAllInputs(state.operator);
  const count = rows.filter(row => row.original === row.combined).length;
  const summary = el('div', 'verification-summary', el('strong', 'verification-count', `8개 중 ${count}개 일치`));
  summary.dataset.tone = count === 8 ? 'success' : 'warning';
  const source = el('a', 'reference-link', 'Martin Fowler의 리팩터링 카탈로그 ↗');
  source.href = 'https://refactoring.com/catalog/consolidateConditionalExpression.html';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.setAttribute('aria-label', 'Martin Fowler의 리팩터링 카탈로그 (새 탭)');
  return [
    panel('verify-panel', '변경 전후 대조표',
      el('div', 'verification-toolbar', operatorOptions(state.operator), summary),
      comparisonTable(rows), feedback(state.operator, rows)),
    el('aside', 'note-card', el('h3', 'note-title', '조건을 합치기 전에'),
      el('p', 'note-text', '어느 한 조건만 충족해도 대기하는 지금의 규칙은 OR로 묶습니다. 만약 안개가 끼고 항로까지 폐쇄된 경우에만 대기하는 중첩 조건이라면 AND로 묶을 수 있습니다.'),
      el('p', 'note-text', '이 예제의 세 조건은 값을 읽기만 합니다. 원래 코드와 같은 순서로 ||를 쓰면 처음 참인 곳에서 평가를 멈춥니다. 조건을 검사할 때 기록을 남기거나 값을 바꾼다면 호출 순서와 횟수도 확인하세요.'),
      source),
    el('div', 'lesson-actions', navigationButton('combine', '조건식 다시 보기', false),
      navigationButton('observe', '다른 조건 관찰하기')),
  ];
}

export class LessonScreen {
  constructor(container, { navigate, storage } = {}) {
    this.container = container;
    this.navigate = navigate;
    this.state = new LessonState(storage);
    this.live = el('div', 'sr-only');
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-atomic', 'true');
    this.container.addEventListener('click', event => this.handleClick(event));
  }

  get hasUnsavedState() {
    return this.state.hasUnsavedState;
  }

  render(route) {
    if (!Object.hasOwn(ROUTES, route)) return;
    this.route = route;
    const { kicker, title, intro } = ROUTES[route];
    const heading = el('header', 'lesson-heading', el('span', 'lesson-kicker', kicker),
      el('h2', 'lesson-title', title), el('p', 'lesson-intro', intro));
    const content = { observe, combine, verify }[route](this.state);
    const section = el('section', 'lesson-screen', heading, ...content);
    section.dataset.route = route;
    if (this.live.parentNode === this.container && this.section?.parentNode === this.container) {
      this.section.replaceWith(section);
    } else {
      this.container.replaceChildren(section, this.live);
    }
    this.section = section;
  }

  handleClick(event) {
    const button = event.target.closest?.('button');
    if (!button || !this.section?.contains(button)) return;
    const { go, flag, operator } = button.dataset;
    if (Object.hasOwn(ROUTES, go)) {
      this.navigate?.(go);
      return;
    }
    let selector;
    let message;
    if (CONDITIONS.some(({ key }) => key === flag)) {
      this.state.setFlag(flag, !this.state.flags[flag]);
      selector = `[data-flag="${flag}"]`;
      message = `운항 판단은 ${evaluateOriginal(this.state.flags).result}입니다.`;
    } else if (isOperator(operator)) {
      this.state.selectOperator(operator);
      selector = `[data-operator="${operator}"]`;
      const count = compareAllInputs(operator).filter(row => row.original === row.combined).length;
      message = `${OPERATORS[operator].name} 선택. 여덟 조합 중 ${count}개가 일치합니다.`;
    } else {
      return;
    }
    this.render(this.route);
    this.section.querySelector(selector)?.focus({ preventScroll: true });
    this.live.textContent = message;
  }
}
