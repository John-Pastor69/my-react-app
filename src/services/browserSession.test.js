import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAccountStorage, clearBrowserCaches, getBrowserSessionId, LOGOUT_EVENT_KEY } from './browserSession.js';
import { sanitizeEventName } from './eventName.js';

const makeStorage = () => {
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value: key => storage[key] ?? null },
    setItem: { value: (key, value) => { storage[key] = String(value); } },
    removeItem: { value: key => { delete storage[key]; } },
  });
  return storage;
};

test('tabs share a session; logout removes account data and permits a fresh session', async () => {
  globalThis.localStorage = makeStorage();
  globalThis.sessionStorage = makeStorage();
  const [firstTab, secondTab] = await Promise.all([
    getBrowserSessionId('account1'), getBrowserSessionId('account1'),
  ]);
  assert.equal(firstTab, secondTab);
  assert.notEqual(await getBrowserSessionId('account2'), firstTab);
  localStorage.setItem('reservationDraft', 'private draft');
  localStorage.setItem('facilityResReadNotifs', '[1]');
  localStorage.setItem('2fa_verified_account1', firstTab);
  sessionStorage.setItem('2fa_verified_account1', 'true');
  sessionStorage.setItem('active_session_account1', 'legacy tab session');
  localStorage.setItem(LOGOUT_EVENT_KEY, 'broadcast');
  localStorage.setItem('firebase:authUser', 'managed by Firebase signOut');
  clearAccountStorage();
  assert.equal(localStorage.getItem('reservationDraft'), null);
  assert.equal(localStorage.getItem('facilityResReadNotifs'), null);
  assert.equal(localStorage.getItem('2fa_verified_account1'), null);
  assert.equal(sessionStorage.getItem('2fa_verified_account1'), null);
  assert.equal(sessionStorage.getItem('active_session_account1'), null);
  assert.equal(localStorage.getItem(LOGOUT_EVENT_KEY), 'broadcast');
  assert.equal(localStorage.getItem('firebase:authUser'), 'managed by Firebase signOut');
  assert.notEqual(await getBrowserSessionId('account1'), firstTab);
});

test('clears every Cache Storage entry for the site', async () => {
  const removed = [];
  globalThis.caches = {
    keys: async () => ['old-app', 'profile-images'],
    delete: async key => { removed.push(key); return true; },
  };
  globalThis.window = { caches: globalThis.caches };
  await clearBrowserCaches();
  assert.deepEqual(removed.sort(), ['old-app', 'profile-images']);
  globalThis.window = {};
  await clearBrowserCaches();
});

test('numbered event names survive editing and draft restoration; symbols are removed', () => {
  assert.equal(sanitizeEventName('STI Assembly 2026'), 'STI Assembly 2026');
  assert.equal(sanitizeEventName('Batch 12: Meet-up! 🎉'), 'Batch 12 Meetup ');
  assert.equal(sanitizeEventName(null), '');
});
