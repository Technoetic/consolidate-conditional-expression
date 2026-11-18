import test from 'node:test';
import assert from 'node:assert/strict';
import { VersionService } from '../src/services/version.mjs';
import { Navigation, readRoute } from '../src/services/navigation.mjs';

const A = 'cce-aaaaaaaaaaaaaaaa';
const B = 'cce-bbbbbbbbbbbbbbbb';
const base = 'https://example.test/tutorial/';
const deferred = () => Promise.withResolvers();

function harness(initial, check) {
  const win = new EventTarget();
  const doc = new EventTarget();
  const url = new URL(initial, base);
  const renders = [], documents = [], notices = [], history = [];
  win.location = {
    get href() { return url.href; },
    assign: value => documents.push(['assign', new URL(value)]),
    replace: value => documents.push(['replace', new URL(value)])
  };
  win.history = { pushState(_state, _title, value) { url.href = value; history.push(url.hash); } };
  const state = { dirty: false, saving: false };
  const navigation = new Navigation({
    win, doc, version: { loaded: A, check },
    readState: () => state,
    render: route => renders.push(route),
    notify: kind => notices.push(kind)
  });
  return { navigation, win, doc, url, renders, documents, notices, history, state };
}

test('route resolution supports a bare entry, deep links and recovery', () => {
  assert.equal(readRoute(''), 'observe');
  assert.equal(readRoute('#/combine'), 'combine');
  assert.equal(readRoute('#/verify'), 'verify');
  for (const hash of ['#/other', '#/verify/extra', '#not-a-route', '#/%ZZ']) {
    assert.equal(readRoute(hash), null);
  }
});

test('the version request is fresh, same origin, subpath-relative and coalesced', async () => {
  const waiting = deferred(), calls = [];
  const version = new VersionService({
    entry: base + '?keep=1#/combine', loaded: B,
    fetcher: async (url, options) => { calls.push({ url, options }); await waiting.promise; return Response.json({ buildId: A }); }
  });
  const one = version.check(), two = version.check();
  waiting.resolve();
  assert.deepEqual(await Promise.all([one, two]), [A, A]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/tutorial/version.json');
  assert.equal(calls[0].url.origin, new URL(base).origin);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.mode, 'same-origin');
  assert.equal(calls[0].options.redirect, 'error');
  await version.check();
  assert.notEqual(calls[1].url.search, calls[0].url.search);
  assert.equal(version.loaded, B);
});

test('invalid responses, network failures and timeout keep the app usable', async () => {
  const replies = [
    () => new Response('error', { status: 503 }),
    () => new Response('not json'),
    () => Response.json({ buildId: '../../wrong' }),
    () => { throw Error('offline'); },
    (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    () => Response.json({ buildId: A })
  ];
  const version = new VersionService({ entry: base, loaded: B, timeout: 20, fetcher: (...args) => replies.shift()(...args) });
  for (let i = 0; i < 5; i++) assert.equal(await version.check(), null);
  assert.equal(await version.check(), A);
});

test('the default browser fetch has its required global receiver', async t => {
  t.mock.method(globalThis, 'fetch', function () {
    if (this !== globalThis) throw TypeError('Illegal invocation');
    return Response.json({ buildId: B });
  });
  const version = new VersionService({ entry: base, loaded: A });
  assert.equal(await version.check(), B);
});

test('initial and foreground detection never replaces the document until navigation', async () => {
  const h = harness('./?lang=ko#/observe', async () => B);
  await h.navigation.start();
  h.win.dispatchEvent(new Event('focus'));
  h.win.dispatchEvent(new Event('pageshow'));
  h.doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.renders, ['observe']);
  assert.equal(h.documents.length, 0);
  await h.navigation.go('combine');
  const [[method, target]] = h.documents;
  assert.equal(method, 'assign');
  assert.equal(target.pathname, '/tutorial/');
  assert.equal(target.origin, new URL(base).origin);
  assert.equal(target.hash, '#/combine');
  assert.equal(target.searchParams.get('lang'), 'ko');
  assert.match(target.searchParams.get('build'), new RegExp('^' + B));
  h.navigation.dispose();
});

test('in-flight changes and failed saves retain the lesson instance through navigation', async () => {
  for (const flag of ['dirty', 'saving']) {
    const waiting = deferred();
    const h = harness('./#/observe', () => waiting.promise);
    const going = h.navigation.go('verify');
    h.state[flag] = true;
    waiting.resolve(B);
    await going;
    assert.deepEqual(h.renders, ['verify']);
    assert.deepEqual(h.history, ['#/verify']);
    assert.deepEqual(h.documents, []);
    assert.ok(h.notices.includes('protect'));
    h.state[flag] = false;
    await h.navigation.go('combine');
    assert.equal(h.documents[0][1].hash, '#/combine');
  }
});

test('only the latest navigation may commit even when responses complete out of order', async () => {
  const first = deferred(), second = deferred(), responses = [first, second];
  const h = harness('./#/observe', () => responses.shift().promise);
  const one = h.navigation.go('combine'), two = h.navigation.go('verify');
  second.resolve(A);
  await two;
  first.resolve(B);
  await one;
  assert.deepEqual(h.history, ['#/verify']);
  assert.deepEqual(h.renders, ['verify']);
  assert.deepEqual(h.documents, []);
});

test('History traversal checks the destination and replaces it on a different build', async () => {
  const h = harness('./#/verify', async () => B);
  await h.navigation.start();
  h.url.hash = '#/combine';
  h.win.dispatchEvent(new Event('popstate'));
  h.win.dispatchEvent(new Event('hashchange'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.documents.length, 1);
  assert.equal(h.documents[0][0], 'replace');
  assert.equal(h.documents[0][1].hash, '#/combine');
  assert.deepEqual(h.history, []);
  h.navigation.dispose();
});

test('same-build and offline navigation both render and accept the next retry', async () => {
  let latest = null;
  const h = harness('./#/observe', async () => latest);
  await h.navigation.go('verify');
  assert.deepEqual(h.renders, ['verify']);
  assert.deepEqual(h.documents, []);
  latest = A;
  await h.navigation.go('combine');
  assert.deepEqual(h.renders, ['verify', 'combine']);
  latest = B;
  await h.navigation.go('observe');
  assert.equal(h.documents[0][1].hash, '#/observe');
});

test('explicit steps request workspace focus and history restores without moving focus', async () => {
  const h = harness('./#/observe', async () => A);
  const calls = [];
  h.navigation.render = (route, focus) => calls.push([route, focus]);
  await h.navigation.start();
  await h.navigation.go('combine');
  h.url.hash = '#/observe';
  h.win.dispatchEvent(new Event('popstate'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [['observe', false], ['combine', true], ['observe', false]]);
  h.navigation.dispose();
});
