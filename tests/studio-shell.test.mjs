import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/skins/studio.css',import.meta.url),'utf8');
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const main=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8');

test('Studio has an isolated native desktop identity and a real three-pane shell',()=>{
  assert.match(main,/文案审核台 · Studio/);
  assert.match(main,/com\.gracylart\.copyreviewdesk\.studio/);
  assert.match(main,/titleBarStyle: 'hiddenInset'/);
  assert.match(html,/class="icon-rail"/);
  assert.match(html,/class="secondary-nav"/);
  assert.match(html,/class="workspace-pane"/);
  assert.match(css,/grid-template-columns:64px 248px minmax\(0,1fr\)/);
});

test('Studio supports both themes, a collapsible tree, reduced motion and nonlinear stream masking',()=>{
  assert.match(css,/\[data-theme="light"\]/);
  assert.match(css,/\.sidebar-collapsed/);
  assert.match(css,/rgba\(0,0,0,\.05\) 15%/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(app,/e\.isComposing\|\|e\.keyCode===229/);
  assert.match(app,/renderSideTree/);
});
