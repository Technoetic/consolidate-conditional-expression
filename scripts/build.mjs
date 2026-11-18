import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const project = fileURLToPath(new URL('../', import.meta.url));
export const buildPattern = /^cce-[a-f0-9]{16}$/;
export const assetPattern = /^(?:src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.mjs|styles\/[a-zA-Z0-9_-]+\.css|assets\/[a-zA-Z0-9_-]+\.webp)$/;
export const hash = buffer => createHash('sha256').update(buffer).digest('hex');

async function collect(source, directory, entries) {
  for (const item of await readdir(path.join(source, directory), { withFileTypes: true })) {
    const relative = directory + '/' + item.name;
    if (item.isDirectory()) await collect(source, relative, entries);
    else if (item.isFile() && assetPattern.test(relative)) {
      entries.set(relative, await readFile(path.join(source, relative)));
    }
  }
}

function validateRef(entries, owner, ref) {
  const relative = path.posix.normalize(path.posix.join(path.posix.dirname(owner), ref));
  if (!entries.has(relative)) throw Error('Missing dependency ' + ref + ' in ' + owner);
  return relative;
}

function validateDependencies(entries) {
  for (const [name, body] of entries) {
    if (name.endsWith('.mjs')) {
      const code = body.toString('utf8');
      for (const match of code.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(["'])([^'"\r\n]+)\1/g)) {
        if (!match[2].startsWith('.')) throw Error('Expected local module in ' + name + ': ' + match[2]);
        validateRef(entries, name, match[2]);
      }
      for (const match of code.matchAll(/new URL\(\s*(["'])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g)) {
        validateRef(entries, name, match[2]);
      }
    }
    if (name.endsWith('.css')) {
      const css = body.toString('utf8');
      for (const match of css.matchAll(/\burl\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g)) {
        const ref = (match[2] ?? match[4]).trim();
        if (!ref.startsWith('data:') && !ref.startsWith('#')) validateRef(entries, name, ref);
      }
    }
  }
}

export async function build({ source = project, output = path.join(project, 'dist') } = {}) {
  const entries = new Map();
  for (const directory of ['src', 'styles', 'assets']) await collect(source, directory, entries);
  for (const required of ['src/main.mjs', 'styles/tokens.css', 'styles/base.css', 'styles/components.css', 'assets/harbor.webp']) {
    validateRef(entries, 'index.html', required);
  }
  validateDependencies(entries);
  const template = await readFile(path.join(source, 'index.html'), 'utf8');
  if (!template.includes('__BUILD_ID__')) throw Error('Missing embedded build identity');
  const files = Object.fromEntries([...entries.keys()].sort().map(name => [name, hash(entries.get(name))]));
  const builder = await readFile(fileURLToPath(import.meta.url));
  const buildId = 'cce-' + hash(JSON.stringify([hash(builder), hash(template), files])).slice(0, 16);
  const prefix = './releases/' + buildId + '/';
  const html = template.replaceAll('__BUILD_ID__', buildId).replace(
    /\b(src|href)\s*=\s*(["'])([\s\S]*?)\2/gi,
    (whole, attr, quote, ref) => {
      if (/^(?:[a-z]+:|\/\/|#|\?|$)/i.test(ref)) return whole;
      const [name, suffix = ''] = ref.split(/(?=[?#])(.+)/);
      const asset = validateRef(entries, 'index.html', name);
      return attr + '=' + quote + prefix + asset + suffix + quote;
    }
  );
  if (!html.includes(prefix + 'src/main.mjs')) throw Error('Missing app entry in index.html');
  const release = path.join(output, 'releases', buildId);
  await mkdir(release, { recursive: true });
  for (const [name, bytes] of entries) {
    const target = path.join(release, name);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, bytes);
  }
  await writeFile(path.join(release, 'manifest.json'), JSON.stringify({ buildId, files }) + '\n');
  await writeFile(path.join(output, '.nojekyll'), '');
  // Publish the complete asset graph before its HTML and discovery pointer.
  for (const [name, value] of [['index.html', html], ['version.json', JSON.stringify({ buildId }) + '\n']]) {
    const temporary = path.join(output, name + '.' + crypto.randomUUID() + '.tmp');
    await writeFile(temporary, value);
    await rename(temporary, path.join(output, name));
  }
  return { buildId, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = process.argv.indexOf('--out');
  const result = await build(option >= 0 ? { output: path.resolve(process.argv[option + 1]) } : {});
  console.log('Built ' + result.buildId + ' in ' + result.output);
}
