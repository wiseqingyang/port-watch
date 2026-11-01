import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { favoriteViews } from '../frontend/src/utils/favorites.js';
import { createFavoritesStore } from '../src/favorites.js';
import { service } from './fixtures.js';

async function favorite() { return createFavoritesStore().add(service); }

test('unscanned and failed scans show unknown rather than offline, even with stale services', async () => {
  const saved = await favorite();
  for (const services of [[], [service]]) {
    const view = favoriteViews([saved], services, false);
    assert.equal(view.saved.length, 1);
    assert.equal(view.saved[0].runtimeUnknown, true);
    assert.equal(view.saved[0].isOffline, false);
    assert.equal(view.saved[0].cwd, service.cwd);
    assert.ok(view.running.every(item => item.runtimeUnknown));
  }
});

test('successful empty scans and recovery distinguish offline from running favorites', async () => {
  const saved = await favorite();
  assert.equal(favoriteViews([saved], [], true).saved[0].isOffline, true);
  const recovered = favoriteViews([saved], [{ ...service, pid: 999, id: '999:new' }], true);
  assert.equal(recovered.saved[0].pid, 999);
  assert.equal(recovered.saved[0].runtimeUnknown, undefined);
  assert.equal(recovered.running[0].favoriteId, saved.favoriteId);
  assert.equal(favoriteViews([], [service], true).running.length, 1, 'missing history cannot hide live services');
});

test('unknown favorite rows and details retain directory actions but expose no live links or stop action', async () => {
  const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url));
  const { createElement } = requireFrontend('react');
  const { renderToStaticMarkup } = requireFrontend('react-dom/server');
  const { I18nProvider } = await import(new URL('../frontend/src/i18n.tsx', import.meta.url).href);
  const { DetailModal } = await import(new URL('../frontend/src/components/DetailModal.tsx', import.meta.url).href);
  const { ServiceList } = await import(new URL('../frontend/src/components/ServiceList.tsx', import.meta.url).href);
  const saved = { ...await favorite(), cwdExists: true };
  const unknown = favoriteViews([saved], [service], false).saved[0];
  const actions = { onClose() {}, onRequestKill() {}, onRevealPath() {}, onOpenTerminal() {}, onToggleFavorite() {}, onOpenDetail() {}, actionLoading: false };
  for (const [component, props] of [
    [DetailModal, { ...actions, service: unknown, isOpen: true }],
    [ServiceList, { ...actions, services: [unknown], viewMode: 'flat', sortMode: 'dir-asc' }],
  ]) {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(component, props)));
    assert.match(html, /运行状态未知/);
    assert.doesNotMatch(html, /href="http:\/\/localhost:/);
    assert.doesNotMatch(html, /停止服务|关闭服务/);
    assert.match(html, /终端/);
    assert.match(html, /定位/);
  }
});
