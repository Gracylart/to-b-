import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const required = ['dist/index.html', 'desktop/main.cjs', 'desktop/preload.cjs', 'desktop/policy.cjs'];
const errors = [];
for (const name of required) {
  if (!existsSync(join(root, name))) errors.push(`Missing application file: ${name}`);
}

function visit(directory) {
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) visit(path);
    else if (/\.(?:mjs|cjs|js)$/.test(name)) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (result.status !== 0) errors.push(result.stderr.trim() || `Syntax error in ${path}`);
    } else if (/\.(?:otf|ttf|woff2?|ttc)$/i.test(name) && /(?:SF[-_ ]?Pro|San[-_ ]?Francisco)/i.test(name)) {
      errors.push(`Do not distribute Apple system fonts: ${path}`);
    }
  }
}
visit(join(root, 'desktop'));
visit(join(root, 'dist'));

if (existsSync(join(root, 'dist/index.html'))) {
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  if (!/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(html)) {
    errors.push('dist/index.html must include a Content-Security-Policy meta tag for file:// loading.');
  }
  if (/<script\b[^>]*\bsrc=["']https?:/i.test(html)) errors.push('Remote JavaScript cannot be bundled in the desktop application.');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1].split(/[?#]/)[0];
    if (!reference || /^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
    const relative = reference.startsWith('/') ? reference.slice(1) : reference;
    if (!existsSync(join(root, 'dist', relative))) errors.push(`Missing referenced asset: ${reference}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Application files, JavaScript syntax, and desktop packaging checks passed.');
}
