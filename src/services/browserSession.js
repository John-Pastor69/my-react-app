export const LOGOUT_EVENT_KEY = 'facilityResLogout';

export async function getBrowserSessionId(uid) {
  const key = `active_session_${uid}`;
  const readOrCreate = () => {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  };
  // Serialize creation so two tabs opened together claim the same session.
  return navigator.locks
    ? navigator.locks.request(key, readOrCreate)
    : readOrCreate();
}

export function clearAccountStorage() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (/^(userRole_|req2FA_|2fa_verified_|active_session_)/.test(key)
        || ['reservationDraft', 'pendingAccountDeletion', 'facilityResReadNotifs', 'facilityResDeletedNotifs'].includes(key)) {
        storage.removeItem(key);
      }
    }
  }
}

export async function clearBrowserCaches() {
  if ('caches' in window) {
    try {
      await Promise.all((await caches.keys()).map(key => caches.delete(key)));
    } catch (error) {
      console.warn('Could not clear browser caches:', error);
    }
  }
}
