import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateOriginal,
  evaluateCombined,
  compareAllInputs,
  LessonState,
  SESSION_KEY,
} from '../src/lesson.mjs';

test('the original stops at the first active condition, in source order', () => {
  const examples = [
    [[false, false, false], '출항', null],
    [[false, false, true], '대기', 'closed'],
    [[false, true, false], '대기', 'fog'],
    [[false, true, true], '대기', 'fog'],
    [[true, false, false], '대기', 'highWind'],
    [[true, false, true], '대기', 'highWind'],
    [[true, true, false], '대기', 'highWind'],
    [[true, true, true], '대기', 'highWind'],
  ];
  for (const [[highWind, fog, closed], result, matched] of examples) {
    assert.deepEqual(evaluateOriginal({ highWind, fog, closed }), { result, matched });
  }
});

test('OR and the original both skip later reads once fog is true', () => {
  const reads = [];
  const flags = {
    get highWind() { reads.push('highWind'); return false; },
    get fog() { reads.push('fog'); return true; },
    get closed() { assert.fail('closed was read after the result was known'); },
  };
  assert.equal(evaluateOriginal(flags).result, '대기');
  assert.equal(evaluateCombined(flags, 'or'), '대기');
  assert.deepEqual(reads, ['highWind', 'fog', 'highWind', 'fog']);
});

test('the truth table covers eight distinct inputs; OR agrees on every row', () => {
  const rows = compareAllInputs('or');
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map(row => JSON.stringify(row.flags))).size, 8);
  assert.equal(rows.filter(row => row.original === row.combined).length, 8);
  assert.equal(rows.filter(row => row.combined === '출항').length, 1);
});

test('AND has six counterexamples, including the single-fog case', () => {
  const rows = compareAllInputs('and');
  assert.equal(rows.filter(row => row.original !== row.combined).length, 6);
  const fogOnly = rows.find(({ flags }) => flags.fog && !flags.highWind && !flags.closed);
  assert.equal(fogOnly.original, '대기');
  assert.equal(fogOnly.combined, '출항');
  assert.equal(evaluateCombined({ highWind: true, fog: true, closed: true }, 'and'), '대기');
});

function memoryStorage() {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
  };
}

test('lesson changes are saved before the action returns and restored in a new instance', () => {
  const storage = memoryStorage();
  const state = new LessonState(storage);
  state.setFlag('highWind', true);
  state.selectOperator('and');
  assert.equal(state.hasUnsavedState, false);
  const restored = new LessonState(storage);
  assert.deepEqual(restored.flags, state.flags);
  assert.equal(restored.operator, 'and');
  assert.equal(restored.hasUnsavedState, false);
});

test('malformed or unrecognized saved state falls back to valid defaults', () => {
  const storage = memoryStorage();
  const initial = new LessonState(storage);
  for (const value of ['not-json', 'null', '{"flags":{},"operator":"and"}',
    '{"flags":{"highWind":0,"fog":false,"closed":false},"operator":"or"}',
    '{"flags":{"highWind":false,"fog":false,"closed":false},"operator":"unknown"}',
    '{"flags":{"highWind":false,"fog":false,"closed":false},"operator":["or"]}']) {
    storage.setItem(SESSION_KEY, value);
    const restored = new LessonState(storage);
    assert.deepEqual(restored.flags, initial.flags);
    assert.equal(restored.operator, initial.operator);
    assert.equal(restored.hasUnsavedState, false);
  }
});

test('storage failures preserve choices in memory, report unsaved state, and recover', () => {
  const storage = memoryStorage();
  const save = storage.setItem;
  storage.setItem = () => { throw Error('quota exceeded'); };
  const state = new LessonState(storage);
  const initialFog = state.flags.fog;
  state.setFlag('fog', !initialFog);
  assert.equal(state.flags.fog, !initialFog);
  assert.equal(state.hasUnsavedState, true);
  state.setFlag('fog', initialFog);
  assert.equal(state.hasUnsavedState, false);
  state.selectOperator('and');
  assert.equal(state.hasUnsavedState, true);
  storage.setItem = save;
  state.setFlag('closed', true);
  assert.equal(new LessonState(storage).operator, 'and');
  assert.equal(state.hasUnsavedState, false);
});
