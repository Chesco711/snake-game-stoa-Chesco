const MULTIPLAYER_SESSION_LOCK_KEY_PREFIX = 'snake_multiplayer_session_lock:';
const MULTIPLAYER_SESSION_LOCK_STALE_MS = 12000;
const MULTIPLAYER_SESSION_LOCK_HEARTBEAT_MS = 3000;

let multiplayerSessionLockHeartbeat = null;

function getMultiplayerSessionLockKey(username = currentUser?.username) {
  if (!username) return null;
  return `${MULTIPLAYER_SESSION_LOCK_KEY_PREFIX}${String(username).toLowerCase()}`;
}

function readMultiplayerSessionLock(username = currentUser?.username) {
  const storageKey = getMultiplayerSessionLockKey(username);
  if (!storageKey) return null;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.tabId || !payload?.username) {
      localStorage.removeItem(storageKey);
      return null;
    }
    if (Date.now() - (Number(payload.updatedAt) || 0) > MULTIPLAYER_SESSION_LOCK_STALE_MS) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function buildMultiplayerSessionLockPayload() {
  if (!currentUser?.username) return null;
  return {
    username: currentUser.username,
    tabId: clientSessionId,
    roomId: roomId || null,
    roomStage: roomStage || 'browse',
    updatedAt: Date.now(),
  };
}

function clearMultiplayerSessionLockHeartbeat() {
  if (!multiplayerSessionLockHeartbeat) return;
  clearInterval(multiplayerSessionLockHeartbeat);
  multiplayerSessionLockHeartbeat = null;
}

function writeMultiplayerSessionLock() {
  const storageKey = getMultiplayerSessionLockKey();
  const payload = buildMultiplayerSessionLockPayload();
  if (!storageKey || !payload) return false;

  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
    return true;
  } catch (error) {
    return false;
  }
}

function ensureMultiplayerSessionLockHeartbeat() {
  if (multiplayerSessionLockHeartbeat) return;
  multiplayerSessionLockHeartbeat = setInterval(() => {
    if (!multiplayerMode || !roomId || roomStage === 'browse') {
      releaseMultiplayerSessionLock();
      return;
    }
    writeMultiplayerSessionLock();
  }, MULTIPLAYER_SESSION_LOCK_HEARTBEAT_MS);
}

function claimMultiplayerSessionLock() {
  if (!currentUser?.username) return true;
  const existingLock = readMultiplayerSessionLock();
  if (existingLock && existingLock.tabId !== clientSessionId) {
    return false;
  }
  const claimed = writeMultiplayerSessionLock();
  if (claimed) ensureMultiplayerSessionLockHeartbeat();
  return claimed || !existingLock;
}

function refreshMultiplayerSessionLock() {
  if (!currentUser?.username || !multiplayerMode || !roomId || roomStage === 'browse') {
    return;
  }
  if (writeMultiplayerSessionLock()) {
    ensureMultiplayerSessionLockHeartbeat();
  }
}

function releaseMultiplayerSessionLock(options = {}) {
  const { force = false } = options;
  clearMultiplayerSessionLockHeartbeat();
  const storageKey = getMultiplayerSessionLockKey();
  if (!storageKey) return;

  try {
    const existingLock = readMultiplayerSessionLock();
    if (!existingLock) return;
    if (force || existingLock.tabId === clientSessionId) {
      localStorage.removeItem(storageKey);
    }
  } catch (error) {}
}

function getMultiplayerSessionBlockedMessage() {
  return 'You are already in a multiplayer session in another tab. Use that tab or open an incognito window for a second player.';
}
