import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireTabAccess, clearAccountStorage, clearBrowserCaches, getBrowserSessionId, LOGOUT_EVENT_KEY } from './browserSession.js';
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

test('logout removes account data and permits a fresh browser session', async () => {
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

// Represents the browser lock manager shared by independent documents.
const makeLocks = () => {
  const held = new Map();
  return {
    async request(name, options, callback) {
      if (held.has(name)) {
        if (options.steal) held.get(name).reject(new DOMException('Lock stolen', 'AbortError'));
        else {
          assert.equal(options.ifAvailable, true);
          return callback(null);
        }
      }
      const claim = {};
      const stolen = new Promise((resolve, reject) => { claim.reject = reject; });
      held.set(name, claim);
      try {
        return await Promise.race([callback({ name }), stolen]);
      } finally {
        if (held.get(name) === claim) held.delete(name);
      }
    },
  };
};

test('the first authenticated tab keeps access and a second cannot displace it', async () => {
  const locks = makeLocks();
  const first = await acquireTabAccess('same-account', locks);
  assert.ok(first);
  assert.equal(await acquireTabAccess('same-account', locks), null);
  assert.equal(await acquireTabAccess('same-account', locks), null);
  first.release();
  await new Promise(resolve => setImmediate(resolve));
  const next = await acquireTabAccess('same-account', locks);
  assert.ok(next);
  next.release();
});

test('an explicit new login ends the old session and keeps the new tab active', async () => {
  const locks = makeLocks();
  const first = await acquireTabAccess('same-account', locks);
  let firstEnded = false;
  first.lost.then(() => { firstEnded = true; });
  // Merely opening another tab does not end the original session.
  assert.equal(await acquireTabAccess('same-account', locks), null);
  assert.equal(firstEnded, false);
  const next = await acquireTabAccess('same-account', locks, { takeover: true });
  await first.lost;
  assert.equal(firstEnded, true);
  assert.ok(next);
  first.release();
  assert.equal(await acquireTabAccess('same-account', locks), null);
  next.release();
});

test('logging in with another account does not end the original account session', async () => {
  const locks = makeLocks();
  const first = await acquireTabAccess('account1', locks);
  let firstEnded = false;
  first.lost.then(() => { firstEnded = true; });
  const other = await acquireTabAccess('account2', locks, { takeover: true });
  assert.equal(firstEnded, false);
  first.release();
  other.release();
});

test('simultaneous tab login grants exactly one owner', async () => {
  const locks = makeLocks();
  const tabs = await Promise.all(Array.from({ length: 5 }, () => acquireTabAccess('same-account', locks)));
  const owners = tabs.filter(Boolean);
  assert.equal(owners.length, 1);
  owners[0].release();
});

test('a duplicated tab cannot bypass ownership by copying browser storage', async () => {
  const locks = makeLocks();
  const first = await acquireTabAccess('same-account', locks);
  sessionStorage.setItem('active_session_same-account', 'copied-id');
  sessionStorage.setItem('2fa_verified_same-account', 'copied-id');
  assert.equal(await acquireTabAccess('same-account', locks), null);
  first.release();
});

test('single-tab protection fails closed if the browser lacks Web Locks', async () => {
  await assert.rejects(acquireTabAccess('same-account', null), /does not support/);
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
