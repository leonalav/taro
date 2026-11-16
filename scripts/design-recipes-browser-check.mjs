import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Run pnpm build first, or point TARO_RECIPE_BASE_URL at a running Taro build.
const app = process.env.TARO_RECIPE_BASE_URL ? undefined
  : await readFile(new URL('../dist/index.html', import.meta.url), 'utf8').catch(() => {
    throw Error('Run pnpm build before the recipe browser check.');
  });
const server = await createServer({ server: { middlewareMode: true, watch: null, ws: false } });
const { designRecipes, renderDesignRecipe } = await server.ssrLoadModule('/src/lib/design-recipes.ts');
const fixtures = new Map(designRecipes.map(recipe => [recipe.id, renderDesignRecipe(recipe, {})]));
const fixtureServer = http.createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/' && app) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.end(app);
  }
  const match = path.match(/^\/__recipe_fixture\/(sandbox|source)\/([a-z-]+)$/);
  if (!match) { response.statusCode = 404; return response.end(); }
  const fixture = fixtures.get(match[2]);
  if (!fixture) { response.statusCode = 404; return response.end(); }
  const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = match[1] === 'source' ? fixture.html
    : `<!doctype html><meta name="viewport" content="width=device-width"><title>Recipe preview fixture</title><style>body{margin:0}iframe{display:block;height:100dvh;width:100%;border:0}</style><iframe title="Recipe preview" sandbox="allow-scripts allow-forms" srcdoc="${escape(fixture.html)}"></iframe>`;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(html);
});
await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
const fixtureOrigin = `http://127.0.0.1:${fixtureServer.address().port}`;
const base = process.env.TARO_RECIPE_BASE_URL || fixtureOrigin;
const fixtureBase = `${fixtureOrigin}/__recipe_fixture`;
let browser;
const errors = [];
const failures = [];
const seen = [];
const screenshots = process.env.TARO_RECIPE_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
const launchArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];

try {
  browser = await chromium.launch({
    channel: process.env.TARO_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    args: launchArgs,
  });
  const desktop = await browser.newContext({ viewport: { width: 1216, height: 900 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 764 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  desktop.setDefaultTimeout(6500);
  mobile.setDefaultTimeout(6500);
  function verify(condition, message) {
    assert.ok(condition, message);
    seen.push(message);
    console.log('PASS ' + message);
  }
  async function attempt(name, run) {
    try { await run(); }
    catch (error) {
      console.error('FAIL ' + name + ': ' + error.message);
      failures.push(name + ': ' + (error.stack || error));
    }
  }
  async function open(id, context = desktop, format = 'sandbox') {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${id}: ${error.message}`));
    await page.goto(`${fixtureBase}/${format}/${id}`);
    const frame = format === 'sandbox' ? page.frames().find(frame => frame.parentFrame()) : page.mainFrame();
    assert.ok(frame, 'preview uses a real document');
    await frame.locator('h1').waitFor();
    assert.equal(await frame.locator('meta[name="taro-design-recipe"]').getAttribute('content'), `${id}@1.0.0`);
    return { page, frame };
  }
  async function pageFits(frame) {
    return frame.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  }
  async function keyboardActivate(frame, name) {
    const target = frame.getByRole('button', { name, exact: true, disabled: false });
    await target.focus();
    await target.press('Enter');
  }
  async function drag(page, target, direction) {
    const bounds = await target.boundingBox();
    assert.ok(bounds, 'drag target has a bounding box');
    const middle = bounds.x + bounds.width / 2;
    const y = bounds.y + Math.min(bounds.height / 2, 120);
    await page.mouse.move(middle + direction * 75, y);
    await page.mouse.down();
    await page.mouse.move(middle - direction * 75, y, { steps: 6 });
    await page.mouse.up();
  }
  async function touchSwipe(page, target, dx, dy) {
    const remote = await page.context().newCDPSession(page);
    const bounds = await target.boundingBox();
    const x = Math.round(bounds.x + bounds.width / 2);
    const y = Math.round(bounds.y + bounds.height / 2);
    const touch = (type, px, py) => remote.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }] });
    try {
      await touch('touchStart', x, y);
      for (let step = 1; step <= 5; step++) await touch('touchMove', Math.round(x + dx * step / 5), Math.round(y + dy * step / 5));
      await touch('touchEnd');
    } finally {
      await remote.detach();
    }
  }

  await attempt('editorial', async () => {
    const { page, frame } = await open('editorial-hero', mobile);
    verify(await pageFits(frame), 'editorial: no horizontal overflow at 390 CSS pixels');
    await frame.getByRole('link', { name: 'Read the field note' }).press('Enter');
    await frame.waitForFunction(() => document.activeElement.id === 'story');
    verify(await frame.getByRole('heading', { name: 'Above the snowline' }).isVisible(), 'editorial: keyboard opens the story inside the sandbox');
    await page.close();
  });
  await attempt('portfolio', async () => {
    const { page, frame } = await open('portfolio-case-study', mobile);
    const slider = frame.getByRole('slider', { name: 'Comparison' });
    await slider.press('Home');
    assert.equal(await slider.inputValue(), '0');
    assert.equal(await frame.locator('.comparison').evaluate(element => element.style.getPropertyValue('--reveal')), '0%');
    await slider.press('End');
    verify(await slider.inputValue() === '100' && await pageFits(frame), 'portfolio: keyboard changes the before/after mask across its full range');
    await page.close();
  });
  await attempt('carousel', async () => {
    const { page, frame } = await open('product-carousel');
    const current = name => frame.getByRole('heading', { name, exact: true }).isVisible();
    await drag(page, frame.locator('[data-drag]'), 1);
    assert.ok(await current('Orbit'));
    await drag(page, frame.locator('[data-drag]'), -1);
    assert.ok(await current('Folio'));
    await keyboardActivate(frame, 'Next');
    await frame.getByRole('button', { name: 'Next' }).press('ArrowRight');
    await keyboardActivate(frame, 'Previous');
    verify(await current('Orbit'), 'carousel: drag in both directions, keyboard arrows and explicit buttons change the visible product');
    await page.close();
    const touch = await open('product-carousel', mobile);
    await touchSwipe(touch.page, touch.frame.locator('.product-plate:visible'), -115, 0);
    await touch.frame.getByRole('heading', { name: 'Orbit', exact: true }).waitFor();
    verify(await pageFits(touch.frame), 'carousel: real touchscreen swipe selects Orbit at phone width');
    await touch.page.close();
  });
  await attempt('gallery', async () => {
    const { page, frame } = await open('image-gallery', mobile);
    await keyboardActivate(frame, 'Shapes');
    assert.equal(await frame.locator('.print-card:visible').count(), 2);
    await keyboardActivate(frame, 'Interval');
    const dialog = frame.getByRole('dialog', { name: 'Interval' });
    assert.ok(await dialog.isVisible());
    assert.match(await dialog.innerText(), /blue plate/);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await frame.waitForFunction(() => document.activeElement.dataset.print === 'interval');
    verify(await pageFits(frame), 'image gallery: filters, native dialog, Escape, and restored focus work at phone width');
    await page.close();
  });
  await attempt('checkout', async () => {
    const { page, frame } = await open('checkout-states', mobile);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const name = frame.getByRole('textbox', { name: 'Full name' });
    const email = frame.getByRole('textbox', { name: 'Email' });
    await keyboardActivate(frame, 'Review reservation');
    assert.equal(await name.getAttribute('aria-invalid'), 'true');
    assert.equal(await email.getAttribute('aria-invalid'), 'true');
    await frame.waitForFunction(() => document.activeElement.id === 'customer');
    await name.fill('Ada Winters');
    await email.fill('not-an-address');
    await keyboardActivate(frame, 'Review reservation');
    assert.equal(await email.getAttribute('aria-invalid'), 'true');
    await email.fill('ada@example.test');
    await frame.getByRole('radio', { name: 'Ship to me' }).check();
    await keyboardActivate(frame, 'Review reservation');
    assert.match(await frame.locator('[data-details]').innerText(), /Ada Winters · ada@example.test · Ship to me/);
    await keyboardActivate(frame, 'Edit details');
    assert.equal(await name.inputValue(), 'Ada Winters');
    await name.fill('Ada W.');
    await keyboardActivate(frame, 'Review reservation');
    assert.match(await frame.locator('[data-details]').innerText(), /Ada W\./);
    await keyboardActivate(frame, 'Confirm sample reservation');
    await frame.waitForFunction(() => document.activeElement.textContent === 'Sample reservation confirmed');
    verify(requests.length === 0 && await pageFits(frame), 'checkout: validation, focus, edited details and local confirmation send no requests');
    await page.close();
  });
  await attempt('navigation', async () => {
    const { page, frame } = await open('responsive-navigation', mobile);
    const menu = frame.locator('summary');
    await menu.press('Enter');
    assert.equal(await frame.locator('details').getAttribute('open'), '');
    await menu.press('Escape');
    assert.equal(await frame.locator('details').getAttribute('open'), null);
    await menu.press('Enter');
    await frame.getByRole('link', { name: 'Archive', exact: true }).press('Enter');
    await frame.waitForFunction(() => document.activeElement.id === 'archive' && !document.querySelector('details').open);
    verify(await pageFits(frame), 'navigation: phone disclosure supports Escape and focus moves to the selected section');
    await page.close();
    const wide = await open('responsive-navigation', desktop, 'source');
    await wide.frame.getByRole('link', { name: 'About', exact: true }).press('Enter');
    assert.equal(new URL(wide.page.url()).hash, '#about');
    await wide.page.close();
  });
  await attempt('responsive source matrix', async () => {
    for (const recipe of designRecipes) {
      for (const width of [320, 1216]) {
        const page = await desktop.newPage();
        const requests = [];
        page.on('pageerror', error => errors.push(`${recipe.id} at ${width}px: ${error.message}`));
        page.on('request', request => requests.push(request.url()));
        try {
          await page.setViewportSize({ width, height: 760 });
          await page.goto(`${fixtureBase}/source/${recipe.id}`);
          assert.equal(await page.locator('h1').count(), 1);
          assert.ok(await pageFits(page.mainFrame()), `${recipe.id} overflows at ${width}px`);
          assert.deepEqual(requests, [`${fixtureBase}/source/${recipe.id}`], `${recipe.id} initiated a network request`);
        } finally {
          await page.close();
        }
      }
    }
    verify(true, 'all 12 standalone sources fit 320 and 1216 CSS pixels and request no assets or dependencies');
  });

  async function loadScene(scene) {
    await scene.page.bringToFront();
    const stage = scene.frame.locator('[data-recipe-stage]');
    assert.equal(await stage.getAttribute('data-recipe-renderer'), 'pending');
    assert.ok(await scene.frame.locator('.scene-poster').isVisible());
    await keyboardActivate(scene.frame, 'Load 3D');
    // Keyboard focus can move the canvas offscreen. Rendering is intentionally deferred until it is visible.
    await stage.scrollIntoViewIfNeeded();
    await scene.frame.waitForSelector('[data-recipe-renderer="webgl"][data-recipe-frame]');
    return stage;
  }
  async function advance(frame, before) {
    await frame.locator('[data-recipe-stage]').scrollIntoViewIfNeeded();
    await frame.waitForFunction(before => Number(document.querySelector('[data-recipe-stage]').dataset.recipeFrame) > before, before);
  }
  async function frameNo(stage) { return Number(await stage.getAttribute('data-recipe-frame')); }
  async function snapshot(stage) { return stage.screenshot({ timeout: 8000, animations: 'disabled' }); }
  async function checkpoint(scene, stage, name, enable = false) {
    const before = await frameNo(stage);
    assert.equal(await scene.frame.evaluate(({ name, enable }) => window.taroRecipeCheckpoint(name, { load: enable }), { name, enable }), true);
    assert.equal(await stage.getAttribute('data-recipe-checkpoint'), name);
    if (await stage.getAttribute('data-recipe-renderer') !== 'fallback') await advance(scene.frame, before);
  }

  await attempt('product viewer', async () => {
    const scene = await open('product-viewer', mobile);
    const stage = await loadScene(scene);
    const canvas = stage.locator('canvas');
    const first = await snapshot(stage);
    const previousYaw = await stage.getAttribute('data-recipe-yaw');
    await drag(scene.page, canvas, -1);
    await scene.frame.waitForFunction(yaw => document.querySelector('[data-recipe-stage]').dataset.recipeYaw !== yaw, previousYaw);
    const turned = await snapshot(stage);
    assert.notDeepEqual(first, turned);
    const before = await frameNo(stage);
    await scene.frame.getByRole('combobox', { name: 'Finish', exact: true }).selectOption('moss');
    await advance(scene.frame, before);
    assert.notDeepEqual(turned, await snapshot(stage));
    await keyboardActivate(scene.frame, 'Reset view');
    assert.equal(await stage.getAttribute('data-recipe-checkpoint'), 'front');
    await keyboardActivate(scene.frame, 'detail');
    assert.match(await scene.frame.locator('[data-detail]').innerText(), /mounting rings/);
    await scene.frame.getByLabel('Render quality').selectOption('static');
    assert.equal(await stage.getAttribute('data-recipe-renderer'), 'fallback');
    assert.ok(await scene.frame.locator('.scene-poster').isVisible());
    verify(await pageFits(scene.frame), '3D viewer: orbit and finish change rendered pixels; keyboard reset, details and static state work');
    await scene.page.close();
  });
  await attempt('material showcase', async () => {
    const scene = await open('lit-material-showcase');
    const stage = await loadScene(scene);
    const before = await snapshot(stage);
    let previous = await frameNo(stage);
    await scene.frame.getByRole('combobox', { name: 'Material', exact: true }).selectOption('copper');
    await advance(scene.frame, previous);
    const copper = await snapshot(stage);
    assert.notDeepEqual(before, copper);
    previous = await frameNo(stage);
    await scene.frame.getByRole('slider', { name: 'Key light (%)', exact: true }).press('Home');
    await advance(scene.frame, previous);
    assert.notDeepEqual(copper, await snapshot(stage));
    await checkpoint(scene, stage, 'rim-light');
    verify(await scene.frame.getByRole('slider').inputValue() === '8', 'materials: choice and key light both change actual rendered pixels');
    await scene.page.close();
  });
  await attempt('particles', async () => {
    const scene = await open('particle-composition');
    const stage = await loadScene(scene);
    assert.equal(await stage.getAttribute('data-recipe-points'), '405');
    const before = await frameNo(stage);
    await keyboardActivate(scene.frame, 'Play rotation');
    await scene.frame.waitForFunction(before => Number(document.querySelector('[data-recipe-stage]').dataset.recipeFrame) > before + 5, before);
    await keyboardActivate(scene.frame, 'Pause rotation');
    await scene.frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const paused = await frameNo(stage);
    await scene.frame.waitForTimeout(160);
    assert.equal(await frameNo(stage), paused);
    await scene.frame.getByLabel('Render quality').selectOption('high');
    await advance(scene.frame, paused);
    verify(await stage.getAttribute('data-recipe-points') === '900', 'particles: play advances frames, pause stops frames, quality changes drawn density');
    await scene.page.emulateMedia({ reducedMotion: 'reduce' });
    await scene.frame.waitForFunction(() => document.querySelector('[data-play]').disabled);
    await checkpoint(scene, stage, 'core');
    verify(await scene.frame.getByRole('button', { name: 'core', exact: true }).getAttribute('aria-pressed') === 'true', 'particles: reduced motion disables rotation and preserves named manual views');
    await scene.page.close();
  });
  await attempt('scroll camera', async () => {
    const scene = await open('scroll-camera', mobile);
    const stage = await loadScene(scene);
    const oldFrames = await frameNo(stage);
    for (const [position, name] of [[0, 'approach'], [.5, 'passage'], [1, 'overview'], [.5, 'passage'], [0, 'approach']]) {
      await scene.frame.evaluate(position => {
        const space = document.querySelector('.scene-timeline');
        scrollTo(0, scrollY + space.getBoundingClientRect().top + position * (space.clientHeight - space.firstElementChild.clientHeight));
      }, position);
      await scene.frame.waitForFunction(({ position, name }) => {
        const stage = document.querySelector('[data-recipe-stage]');
        return Math.abs(Number(stage.dataset.recipeProgress) - position) < .012 && stage.dataset.recipeCheckpoint === name;
      }, { position, name });
    }
    assert.ok(await frameNo(stage) > oldFrames);
    await scene.page.emulateMedia({ reducedMotion: 'reduce' });
    await scene.frame.waitForFunction(() => !document.querySelector('.scene-timeline').classList.contains('is-scrolling'));
    await stage.scrollIntoViewIfNeeded();
    await checkpoint(scene, stage, 'overview');
    verify(await scene.frame.locator('[data-beat]').count() === 3, 'scroll camera: five forward/reverse checkpoint states and reduced-motion manual control work');
    await scene.page.close();
  });
  await attempt('object selection', async () => {
    const scene = await open('selectable-object-scene');
    const stage = await loadScene(scene);
    const box = await stage.locator('canvas').boundingBox();
    const original = await snapshot(stage);
    for (const [x, name] of [[.52, 'orb'], [.71, 'knot'], [.29, 'column']]) {
      await scene.page.mouse.click(box.x + x * box.width, box.y + .5 * box.height);
      assert.equal(await stage.getAttribute('data-recipe-checkpoint'), name);
      assert.match(await scene.frame.locator('[data-detail]').innerText(), new RegExp(name, 'i'));
      if (name === 'orb') assert.notDeepEqual(original, await snapshot(stage));
    }
    await scene.frame.getByLabel('Render quality').selectOption('static');
    await keyboardActivate(scene.frame, 'orb');
    verify(await stage.getAttribute('data-recipe-checkpoint') === 'orb', 'object selection: all three screen-space picks work; keyboard selection works in static view');
    await scene.page.close();
  });
  await attempt('adaptive quality', async () => {
    const scene = await open('adaptive-quality-scene');
    const stage = await loadScene(scene);
    const canvas = stage.locator('canvas');
    const low = await canvas.evaluate(canvas => canvas.width);
    assert.equal(await stage.getAttribute('data-recipe-quality'), 'low');
    await scene.frame.getByLabel('Render quality').selectOption('high');
    await scene.frame.waitForFunction(low => document.querySelector('canvas').width > low, low);
    await scene.frame.getByLabel('Render quality').selectOption('auto');
    assert.equal(await stage.getAttribute('data-recipe-quality'), 'low');
    await keyboardActivate(scene.frame, 'Play rotation');
    await scene.frame.waitForFunction(() => Number(document.querySelector('[data-recipe-stage]').dataset.recipeMedianMs) > 0);
    await scene.frame.evaluate(() => {
      const gap = document.createElement('div');
      gap.style.height = '180vh';
      document.body.append(gap);
      scrollTo(0, document.documentElement.scrollHeight);
    });
    await scene.frame.waitForTimeout(180);
    const rested = await frameNo(stage);
    await scene.frame.waitForTimeout(180);
    assert.equal(await frameNo(stage), rested);
    await stage.scrollIntoViewIfNeeded();
    await advance(scene.frame, rested);
    const lose = await canvas.evaluate(canvas => {
      const extension = canvas.getContext('webgl').getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      return true;
    });
    assert.ok(lose, 'the browser must exercise actual WebGL context loss');
    await scene.frame.waitForSelector('[data-recipe-renderer="fallback"]');
    await keyboardActivate(scene.frame, 'above');
    verify(await stage.getAttribute('data-recipe-checkpoint') === 'above' && await scene.frame.locator('.scene-poster').isVisible(), 'adaptive scene: resolution tiers, frame sampling, offscreen suspension and actual context-loss fallback work');
    await scene.page.close();
  });
  await attempt('named checkpoint and disabled WebGL', async () => {
    const scene = await open('product-viewer', desktop, 'source');
    const stage = scene.frame.locator('[data-recipe-stage]');
    await checkpoint(scene, stage, 'detail', true);
    assert.equal(await stage.getAttribute('data-recipe-renderer'), 'webgl');
    assert.equal(await scene.frame.evaluate(() => window.taroRecipeCheckpoint('undefined-moment')), false);
    verify(await stage.getAttribute('data-recipe-checkpoint') === 'detail', 'recipe checkpoint API activates unloaded local WebGL and rejects unknown moments');
    await scene.page.close();
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type.startsWith('webgl') ? null : original.call(this, type, ...args);
      };
    });
    const fallback = await open('product-viewer', blocked);
    await keyboardActivate(fallback.frame, 'Load 3D');
    assert.ok(await fallback.frame.locator('[data-recipe-renderer="fallback"]').isVisible());
    await keyboardActivate(fallback.frame, 'profile');
    verify(await fallback.frame.locator('[data-detail]').innerText() === 'See the depth of the cabinet from the side. Finish: terracotta.', 'blocked WebGL still provides visible poster and equivalent HTML details');
    await blocked.close();
  });
  await attempt('Gallery integration', async () => {
    const page = await desktop.newPage();
    await page.bringToFront();
    page.on('pageerror', error => errors.push('Gallery: ' + error.message));
    await page.route(/^https:\/\//, route => route.abort());
    await page.addInitScript(() => {
      if (window !== window.top) return;
      if (localStorage.getItem('recipe-qa-seeded')) return;
      localStorage.setItem('recipe-qa-seeded', '1');
      localStorage.setItem('taro-preferences-v1', JSON.stringify({ appearance: { reduceMotion: true } }));
      localStorage.setItem('taro-chat-v1', JSON.stringify({
        folders: [{ id: 'folder-design-qa', name: 'Design recipes', path: 'A:/design-qa' }],
        threads: [{ id: 'recipe-qa', name: 'Recipe verification', folderId: 'folder-design-qa', updated: 'now', messages: [] }],
        activeThreadId: 'recipe-qa',
      }));
    });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.locator('.reception-recent').filter({ hasText: 'Recipe verification' }).click({ timeout: 35000 });
    await page.getByRole('button', { name: 'Browse media', exact: true }).click({ timeout: 35000 });
    await page.getByRole('button', { name: 'Recipes', exact: true }).click();
    await page.getByText('12 recipes', { exact: true }).waitFor();
    if (screenshots) await page.screenshot({ path: path.join(screenshots, 'gallery-recipes.png') });
    await page.getByRole('textbox', { name: 'Search design recipes' }).fill('product orbit');
    await page.getByText('1 recipe', { exact: true }).waitFor();
    const trigger = page.getByRole('button', { name: 'Preview 3D product viewer' });
    await trigger.click();
    await page.getByRole('button', { name: 'Phone preview' }).click();
    const frameLocator = page.frameLocator('iframe[title="Interactive recipe preview"]');
    await frameLocator.getByRole('heading', { name: '3D product viewer' }).waitFor();
    assert.ok((await page.locator('iframe').boundingBox()).width <= 390);
    await page.getByLabel('Initial finish').selectOption('moss');
    assert.ok(await page.getByRole('button', { name: 'Download source' }).isDisabled());
    const priorPreview=await page.locator('iframe[title="Interactive recipe preview"]').elementHandle();
    await page.getByRole('button', { name: 'Apply settings' }).click();
    assert.equal(await priorPreview.evaluate(frame=>frame.isConnected),false,'applied settings replace the browsing context');
    await frameLocator.locator('[data-setting="finish"] option:checked[value="moss"]').waitFor({ state: 'attached' });
    const traceInput = element => {
      const view = element.ownerDocument.defaultView;
      view.__taroRecipeClickTrace = [];
      for (const type of ['pointerdown','pointerup','click']) view.addEventListener(type, event => {
        view.__taroRecipeClickTrace.push([event.type,event.target?.tagName,event.target?.hasAttribute('data-load'),event.clientX,event.clientY]);
      }, true);
    };
    await page.locator('body').evaluate(traceInput);
    await frameLocator.locator('body').evaluate(traceInput);
    await frameLocator.getByRole('button', { name: 'Load 3D' }).click();
    await frameLocator.locator('[data-recipe-stage]').scrollIntoViewIfNeeded();
    try { await frameLocator.locator('[data-recipe-renderer="webgl"][data-recipe-frame]').waitFor(); }
    catch (error) {
      const status = await frameLocator.locator('[data-state]').textContent({ timeout: 1000 }).catch(() => 'unavailable');
      const frameTrace=await frameLocator.locator('body').evaluate(body=>body.ownerDocument.defaultView.__taroRecipeClickTrace).catch(()=>undefined);
      const parentTrace=await page.evaluate(()=>window.__taroRecipeClickTrace);
      throw Error(`Gallery 3D status: ${status}. Input trace: ${JSON.stringify({frameTrace,parentTrace})}. ${error.message}`);
    }
    if (screenshots) await page.screenshot({ path: path.join(screenshots, 'gallery-viewer.png') });
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download source' }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'product-viewer-1.0.0.html');
    const contents = await download.createReadStream();
    const chunks = [];
    for await (const chunk of contents) chunks.push(chunk);
    const viewer = designRecipes.find(recipe => recipe.id === 'product-viewer');
    assert.equal(Buffer.concat(chunks).toString('utf8'), renderDesignRecipe(viewer, { finish: 'moss' }).html);
    await page.getByRole('button', { name: 'Back to recipes' }).click();
    assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
    await page.getByText('Importable design skills', { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /^Download .* skill$/ }).count(), 6);
    await trigger.click();
    await page.getByLabel('Initial finish').selectOption('moss');
    await page.getByRole('button', { name: 'Apply settings' }).click();
    await page.getByRole('button', { name: 'Use in chat' }).click();
    const chip = page.locator('[data-chip-value]').filter({ hasText: '3D product viewer' });
    await chip.waitFor();
    assert.deepEqual(JSON.parse(await chip.getAttribute('data-chip-value')).recipe,
      { id: 'product-viewer', title: '3D product viewer', version: '1.0.0', settings: { finish: 'moss', quality: 'auto' } });
    verify(true, 'Gallery: app navigation, 12 recipes, search, phone preview, typed setting, WebGL, exact download, focus restoration, six skill links, and pinned composer handoff');
    await page.close();
  });

  if (errors.length) failures.push('Unexpected browser errors:\n' + errors.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n\n'));
  console.log(`${seen.length} browser checks passed.`);
} finally {
  await browser?.close();
  fixtureServer.closeAllConnections();
  await new Promise(resolve => fixtureServer.close(resolve));
  await server.close();
}
