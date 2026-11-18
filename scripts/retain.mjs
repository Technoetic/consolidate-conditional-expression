import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetPattern, buildPattern, hash, project } from './build.mjs';

async function readBytes(response, limit) {
  if (!response.ok) throw Error('Previous release HTTP ' + response.status);
  let length = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) throw Error('Previous release exceeds file size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function retainPrevious({ base, output = path.join(project, 'dist'), fetcher = fetch }) {
  const site = new URL(base);
  if (!site.pathname.endsWith('/')) site.pathname += '/';
  const request = name => {
    const url = new URL(name, site);
    url.searchParams.set('release-check', crypto.randomUUID());
    return fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
  };
  const current = JSON.parse(await readFile(path.join(output, 'version.json'), 'utf8'));
  if (!buildPattern.test(current.buildId)) throw Error('Invalid local version');
  const pointer = await request('version.json');
  if (pointer.status === 404) {
    const entry = await request('index.html');
    if (entry.status === 404) return null;
    throw Error('Published site exists without its version metadata (entry HTTP ' + entry.status + ')');
  }
  const previous = JSON.parse((await readBytes(pointer, 2048)).toString('utf8'));
  if (!buildPattern.test(previous.buildId)) throw Error('Invalid published version');
  const keep = previous.buildId === current.buildId ? previous.previousBuild : previous.buildId;
  if (keep === undefined) return null;
  if (!buildPattern.test(keep) || keep === current.buildId) throw Error('Invalid previous version');
  const relative = 'releases/' + keep + '/';
  const manifest = JSON.parse((await readBytes(await request(relative + 'manifest.json'), 65536)).toString('utf8'));
  if (manifest.buildId !== keep || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw Error('Invalid previous release manifest');
  }
  const files = Object.entries(manifest.files);
  if (!Object.hasOwn(manifest.files, 'src/main.mjs') || files.length > 256) throw Error('Invalid previous release file list');
  const verified = [];
  let total = 0;
  for (const [name, expected] of files) {
    if (!assetPattern.test(name) || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid previous release asset');
    const bytes = await readBytes(await request(relative + name), 8 * 1024 * 1024);
    total += bytes.length;
    if (total > 24 * 1024 * 1024) throw Error('Previous release exceeds total size limit');
    if (hash(bytes) !== expected) throw Error('Previous release hash mismatch for ' + name);
    verified.push([name, bytes]);
  }
  for (const [name, bytes] of verified) {
    const target = path.join(output, relative, name);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, bytes);
  }
  await writeFile(path.join(output, relative, 'manifest.json'), JSON.stringify(manifest) + '\n');
  await writeFile(path.join(output, 'version.json'), JSON.stringify({ buildId: current.buildId, previousBuild: keep }) + '\n');
  return keep;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.PAGES_BASE) throw Error('Set PAGES_BASE to the published project URL');
  const retained = await retainPrevious({base: process.env.PAGES_BASE});
  console.log(retained ? 'Retained ' + retained : 'No prior release to retain');
}
