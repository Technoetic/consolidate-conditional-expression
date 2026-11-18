import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../scripts/build.mjs';
import { retainPrevious } from '../scripts/retain.mjs';
import { createServer } from '../scripts/server.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cce-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'app'), output = path.join(root, 'dist');
  const files = {
    'index.html': '<meta name="app-build" content="__BUILD_ID__">\n<link rel="stylesheet" href="./styles/tokens.css">\n<link rel="stylesheet" href="./styles/base.css">\n<link rel="stylesheet" href="./styles/components.css">\n<img src="./assets/harbor.webp"><script type="module" src="./src/main.mjs"></script>',
    'src/main.mjs': "import { value } from './lesson.mjs'; console.log(value);",
    'src/lesson.mjs': 'export const value = 4;',
    'styles/tokens.css': ':root { --ink: black; }',
    'styles/base.css': 'body { color: var(--ink); }',
    'styles/components.css': ".hero { background: url('../assets/harbor.webp'); }",
    'assets/harbor.webp': Buffer.from('WEBP-test')
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await writeFile(path.join(source, name), content);
  }
  return { root, source, output };
}

async function serve(t, root) {
  const server = createServer({ root });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return 'http://127.0.0.1:' + server.address().port + '/consolidate-conditional-expression/';
}

test('the content identity covers HTML, JS, CSS and images and references one release', async t => {
  const { source, output } = await fixture(t);
  const first = await build({ source, output });
  assert.equal(first.buildId, (await build({ source, output })).buildId);
  const html = await readFile(path.join(output, 'index.html'), 'utf8');
  for (const filename of ['src/main.mjs','styles/base.css','assets/harbor.webp']) {
    assert.ok(html.includes('./releases/' + first.buildId + '/' + filename));
  }
  assert.ok(html.includes('content="' + first.buildId + '"'));
  let previous = first;
  for (const filename of ['index.html', 'src/lesson.mjs', 'styles/base.css', 'assets/harbor.webp']) {
    await writeFile(path.join(source, filename), '\n', {flag: 'a'});
    const next = await build({ source, output });
    assert.notEqual(next.buildId, previous.buildId, filename);
    previous = next;
  }
});

test('an unresolved module, CSS url or HTML asset makes building fail before publishing the entry', async t => {
  const { source, output } = await fixture(t);
  const { buildId } = await build({ source, output });
  for (const [name, line] of [
    ['src/main.mjs', "import './missing.mjs';"],
    ['styles/base.css', "a { background-image: url(../assets/missing.webp); }"],
    ['index.html', '<img src="./assets/missing.webp">'],
    ['index.html', '<img src="missing.webp">']
  ]) {
    const file = path.join(source, name);
    const original = await readFile(file);
    await writeFile(file, '\n' + line, {flag: 'a'});
    await assert.rejects(() => build({ source, output }), /missing/i);
    assert.equal(JSON.parse(await readFile(path.join(output, 'version.json'))).buildId, buildId);
    await writeFile(file, original);
  }
});

test('local preview serves deep-link entry, correct MIME and genuine asset/API 404s', async t => {
  const { source, output } = await fixture(t);
  const { buildId } = await build({ source, output });
  const base = await serve(t, output);
  const response = await fetch(base + '?build=latest#/verify');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-(?:cache|store)/);
  assert.ok((await response.text()).includes(buildId));
  const asset = await fetch(base + 'releases/' + buildId + '/src/main.mjs');
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.match(asset.headers.get('content-type'), /javascript/);
  for (const missing of ['api/example','assets/missing.webp','src/main.mjs','bogus/']) {
    assert.equal((await fetch(base + missing)).status, 404);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});

test('deployment keeps the previous release only, including when retrying the identical build', async t => {
  const { root, source, output } = await fixture(t);
  const { buildId: old } = await build({ source, output });
  const previousBase = await serve(t, output);
  await writeFile(path.join(source, 'src/lesson.mjs'), 'export const value = 5;');
  const fresh = path.join(root, 'fresh');
  const { buildId: next } = await build({ source, output: fresh });
  assert.notEqual(old, next);
  await retainPrevious({ base: previousBase, output: fresh });
  const secondBase = await serve(t, fresh);
  let version = await (await fetch(secondBase + 'version.json')).json();
  assert.deepEqual(version, { buildId: next, previousBuild: old });
  assert.equal(await (await fetch(secondBase + 'releases/' + old + '/src/lesson.mjs')).text(), 'export const value = 4;');
  const retry = path.join(root, 'retry');
  await build({ source, output: retry });
  await retainPrevious({ base: secondBase, output: retry });
  version = JSON.parse(await readFile(path.join(retry, 'version.json')));
  assert.equal(version.previousBuild, old);
  await writeFile(path.join(source, 'src/lesson.mjs'), 'export const value = 6;');
  const third = path.join(root, 'third');
  await build({ source, output: third });
  await retainPrevious({ base: secondBase, output: third });
  const thirdBase = await serve(t, third);
  assert.equal((await fetch(thirdBase + 'releases/' + old + '/src/main.mjs')).status, 404);
  assert.equal((await fetch(thirdBase + 'releases/' + next + '/src/main.mjs')).status, 200);
});

test('retention fails on tampered assets and permits a genuinely empty site at first deploy', async t => {
  const { root, source, output } = await fixture(t);
  const emptyBase = await serve(t, root);
  const { buildId } = await build({ source, output });
  await retainPrevious({ base: emptyBase, output });
  const broken = path.join(root, 'broken');
  await cp(output, broken, {recursive: true});
  await writeFile(path.join(broken, 'releases', buildId, 'src/main.mjs'), 'changed');
  await writeFile(path.join(source, 'src/main.mjs'), 'export default 4;');
  const fresh = path.join(root, 'fresh');
  const next = await build({ source, output: fresh });
  const brokenBase = await serve(t, broken);
  await assert.rejects(() => retainPrevious({ base: brokenBase, output: fresh }), /hash/i);
  assert.deepEqual(JSON.parse(await readFile(path.join(fresh, 'version.json'))), { buildId: next.buildId });
});
