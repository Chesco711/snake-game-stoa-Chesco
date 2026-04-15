const LOBBY_ROOM_STALE_MS = 12000;
const LOBBY_ROOM_HEARTBEAT_MS = 2500;
const LOBBY_ROOM_REFRESH_DELAY_MS = 120;
let lobbyOpenRooms = new Map();
let lobbyRoomHeartbeatTimer = null;
let lobbyRoomExpiryTimer = null;
let lobbyRoomRefreshTimer = null;
let lastPublishedLobbyRoomStateKey = null;
let currentLobbyRoomState = null;
let lastCurrentLobbyRoomStateDebugKey = null;
let lastCurrentLobbyRoomStateDebugRoomId = null;
const lobbyRoomUpsertDebugKeys = new Map();

function lobbyStateDebug(event, details = null, topic = 'room_state') {
  if (typeof lobbyDebug === 'function') {
    lobbyDebug(event, details, topic);
  }
}

function shouldLogLobbyHeartbeatDebug() {
  if (typeof window === 'undefined') return false;
  if (typeof window.mpIsDebugEnabled !== 'function') return false;
  return window.mpIsDebugEnabled('heartbeat', 'lobby');
}

function cloneLobbyRoomSettings(settings = {}) {
  return JSON.parse(JSON.stringify(settings));
}

function getLobbyRoomDebugSummary(roomState) {
  if (!roomState?.roomId) return null;
  return {
    roomId: roomState.roomId,
    status: roomState.status || 'open',
    hostUsername: roomState.hostUsername || '?',
    playerCount: Math.max(1, Number(roomState.playerCount) || 1),
  };
}

function serializeLobbyRoomDebugSummary(roomState) {
  const summary = getLobbyRoomDebugSummary(roomState);
  return summary ? JSON.stringify(summary) : null;
}

function shouldLogCurrentLobbyRoomState(roomState) {
  const nextKey = serializeLobbyRoomDebugSummary(roomState);
  if (!nextKey) return false;
  if (
    lastCurrentLobbyRoomStateDebugRoomId === roomState.roomId &&
    lastCurrentLobbyRoomStateDebugKey === nextKey
  ) {
    return false;
  }
  lastCurrentLobbyRoomStateDebugRoomId = roomState.roomId;
  lastCurrentLobbyRoomStateDebugKey = nextKey;
  return true;
}

function shouldLogLobbyRoomUpsert(roomState) {
  const nextKey = serializeLobbyRoomDebugSummary(roomState);
  if (!nextKey || !roomState?.roomId) return false;
  if (lobbyRoomUpsertDebugKeys.get(roomState.roomId) === nextKey) {
    return false;
  }
  lobbyRoomUpsertDebugKeys.set(roomState.roomId, nextKey);
  return true;
}

function normalizeLobbyRoomState(payload) {
  if (!payload?.roomId) return null;
  return {
    roomId: payload.roomId,
    hostSessionId: payload.hostSessionId || null,
    hostUsername: payload.hostUsername || '?',
    status: payload.status || 'open',
    playerCount: Math.max(1, Number(payload.playerCount) || 1),
    settings: cloneLobbyRoomSettings(payload.settings || {}),
    updatedAt: Number(payload.updatedAt) || Date.now(),
    receivedAt: Date.now(),
  };
}

function cloneLobbyRoomState(roomState) {
  if (!roomState) return null;
  return {
    roomId: roomState.roomId,
    hostSessionId: roomState.hostSessionId,
    hostUsername: roomState.hostUsername,
    status: roomState.status,
    playerCount: roomState.playerCount,
    settings: cloneLobbyRoomSettings(roomState.settings),
    updatedAt: roomState.updatedAt,
    receivedAt: roomState.receivedAt,
  };
}

function scheduleLobbyRoomExpirySweep() {
  if (lobbyRoomExpiryTimer) {
    clearTimeout(lobbyRoomExpiryTimer);
    lobbyRoomExpiryTimer = null;
  }

  const rooms = Array.from(lobbyOpenRooms.values());
  if (!rooms.length) return;

  const nextExpiryAt = Math.min(...rooms.map((room) => room.receivedAt + LOBBY_ROOM_STALE_MS));
  const delay = Math.max(0, nextExpiryAt - Date.now());

  lobbyRoomExpiryTimer = setTimeout(() => {
    lobbyRoomExpiryTimer = null;
    const removed = pruneStaleLobbyRooms();
    if (removed && typeof renderAvailableRooms === 'function') {
      renderAvailableRooms();
    }
  }, delay);
}

function pruneStaleLobbyRooms() {
  const now = Date.now();
  let removed = false;

  lobbyOpenRooms.forEach((room, roomId) => {
    if (room.status === 'closed' || now - room.receivedAt > LOBBY_ROOM_STALE_MS) {
      lobbyOpenRooms.delete(roomId);
      removed = true;
    }
  });

  scheduleLobbyRoomExpirySweep();
  return removed;
}

function clearLobbyOpenRooms() {
  lobbyOpenRooms.clear();
  lobbyRoomUpsertDebugKeys.clear();
  if (lobbyRoomExpiryTimer) {
    clearTimeout(lobbyRoomExpiryTimer);
    lobbyRoomExpiryTimer = null;
  }
}

async function requestLobbyRoomRegistry(reason = 'manual') {
  if (!lobbyChannel || lobbyConnectionState !== LOBBY_CONNECTION_STATE.READY || !currentUser) {
    lobbyStateDebug('requestLobbyRoomRegistry:skip', {
      reason,
      hasLobbyChannel: Boolean(lobbyChannel),
      lobbyConnectionState: typeof lobbyConnectionState === 'string' ? lobbyConnectionState : 'unknown',
      hasCurrentUser: Boolean(currentUser),
    }, 'discovery');
    return false;
  }

  await lobbyChannel.send({
    type: 'broadcast',
    event: 'room:registry-request',
    payload: {
      requesterSessionId: clientSessionId,
      requesterUsername: currentUser.username,
      updatedAt: Date.now(),
      reason,
    },
  });
  lobbyStateDebug('requestLobbyRoomRegistry:sent', { reason }, 'discovery');
  return true;
}

function clearCurrentLobbyRoomState() {
  currentLobbyRoomState = null;
  lastCurrentLobbyRoomStateDebugKey = null;
  lastCurrentLobbyRoomStateDebugRoomId = null;
}

function stopLobbyRoomHeartbeat() {
  if (!lobbyRoomHeartbeatTimer) return;
  clearInterval(lobbyRoomHeartbeatTimer);
  lobbyRoomHeartbeatTimer = null;
}

function clearLobbyRoomRefreshTimer() {
  if (!lobbyRoomRefreshTimer) return;
  clearTimeout(lobbyRoomRefreshTimer);
  lobbyRoomRefreshTimer = null;
}

function resetPublishedLobbyRoomState() {
  lastPublishedLobbyRoomStateKey = null;
  stopLobbyRoomHeartbeat();
  clearLobbyRoomRefreshTimer();
}

function getLobbyRoomStatus() {
  if (!roomId) return 'closed';
  if (roomStage === 'lobby') return 'open';
  if (roomStage === 'playing') return 'starting';
  return 'closed';
}

function getLobbyRoomPlayerCount() {
  if (typeof getRoomParticipants === 'function' && mpChannel) {
    const participants = getRoomParticipants();
    if (participants.length) return participants.length;
  }

  if (roomId && currentUser) return 1;
  return 0;
}

function buildCurrentLobbyRoomState() {
  if (!roomId || !currentUser) return null;

  return {
    roomId,
    hostSessionId: clientSessionId,
    hostUsername: currentUser.username,
    status: getLobbyRoomStatus(),
    playerCount: Math.max(1, getLobbyRoomPlayerCount()),
    settings: typeof getRoomSettings === 'function'
      ? cloneLobbyRoomSettings(getRoomSettings())
      : {},
    updatedAt: Date.now(),
  };
}

function getCurrentLobbyRoomState() {
  return cloneLobbyRoomState(currentLobbyRoomState);
}

function applyCurrentLobbyRoomState(payload, source = 'remote') {
  const nextRoomState = normalizeLobbyRoomState(payload);
  if (!nextRoomState || nextRoomState.roomId !== roomId) return false;
  if (
    typeof shouldIgnoreIncomingRoomState === 'function' &&
    shouldIgnoreIncomingRoomState(nextRoomState, source)
  ) {
    return false;
  }
  if (currentLobbyRoomState && currentLobbyRoomState.updatedAt > nextRoomState.updatedAt) {
    return false;
  }

  currentLobbyRoomState = nextRoomState;
  if (shouldLogCurrentLobbyRoomState(nextRoomState)) {
    lobbyStateDebug('currentLobbyRoomState:apply', {
      source,
      roomId: nextRoomState.roomId,
      status: nextRoomState.status,
      hostUsername: nextRoomState.hostUsername,
      playerCount: nextRoomState.playerCount,
    });
  }

  if (typeof applyRoomSettings === 'function') {
    applyRoomSettings(nextRoomState.settings || {}, nextRoomState.updatedAt);
  }
  if (typeof renderCorpseModeControl === 'function') renderCorpseModeControl();
  if (typeof renderShootingModeControl === 'function') renderShootingModeControl();
  if (roomStage === 'lobby' && typeof updateLobbyList === 'function') {
    updateLobbyList();
  }
  return true;
}

function serializeLobbyRoomState(roomState) {
  return JSON.stringify({
    roomId: roomState.roomId,
    hostSessionId: roomState.hostSessionId,
    hostUsername: roomState.hostUsername,
    status: roomState.status,
    playerCount: roomState.playerCount,
    settings: roomState.settings,
  });
}

function upsertLobbyOpenRoom(payload, source = 'remote') {
  const nextRoom = normalizeLobbyRoomState(payload);
  if (!nextRoom) return false;

  const existingRoom = lobbyOpenRooms.get(nextRoom.roomId);
  if (existingRoom && existingRoom.updatedAt > nextRoom.updatedAt) {
    return false;
  }

  lobbyOpenRooms.set(nextRoom.roomId, nextRoom);
  if (nextRoom.roomId === roomId) {
    applyCurrentLobbyRoomState(nextRoom, source);
  }
  scheduleLobbyRoomExpirySweep();
  if (shouldLogLobbyRoomUpsert(nextRoom)) {
    lobbyStateDebug('lobbyRoomState:upsert', {
      source,
      roomId: nextRoom.roomId,
      status: nextRoom.status,
      playerCount: nextRoom.playerCount,
      hostUsername: nextRoom.hostUsername,
    }, 'discovery');
  }
  return true;
}

function removeLobbyOpenRoom(roomIdToRemove, source = 'remote') {
  if (!roomIdToRemove) return false;
  const removed = lobbyOpenRooms.delete(roomIdToRemove);
  lobbyRoomUpsertDebugKeys.delete(roomIdToRemove);
  if (roomIdToRemove === roomId && currentLobbyRoomState?.roomId === roomIdToRemove) {
    clearCurrentLobbyRoomState();
  }
  if (removed) {
    lobbyStateDebug('lobbyRoomState:remove', {
      source,
      roomId: roomIdToRemove,
    }, 'discovery');
  }
  scheduleLobbyRoomExpirySweep();
  return removed;
}

function handleLobbyRoomBroadcast(eventName, payload) {
  pruneStaleLobbyRooms();

  if (eventName === 'room:close') {
    return removeLobbyOpenRoom(payload?.roomId, eventName);
  }

  return upsertLobbyOpenRoom(payload, eventName);
}

function getDiscoveredOpenRooms() {
  pruneStaleLobbyRooms();
  return Array.from(lobbyOpenRooms.values())
    .filter((room) => room.status === 'open')
    .sort((a, b) => b.updatedAt - a.updatedAt || a.roomId.localeCompare(b.roomId))
    .map((room) => ({
      id: room.roomId,
      host: room.hostUsername,
      playerCount: room.playerCount,
      updatedAt: room.updatedAt,
      settings: cloneLobbyRoomSettings(room.settings),
    }));
}

function getLobbyOpenRoom(roomIdToFind) {
  if (!roomIdToFind) return null;
  const room = lobbyOpenRooms.get(roomIdToFind);
  return room ? cloneLobbyRoomState(room) : null;
}

function ensureLobbyRoomHeartbeat() {
  if (lobbyRoomHeartbeatTimer) return;
  lobbyRoomHeartbeatTimer = setInterval(() => {
    void syncLobbyRoomState({
      force: true,
      eventName: 'room:heartbeat',
      reason: 'heartbeat',
    });
  }, LOBBY_ROOM_HEARTBEAT_MS);
}

function scheduleLobbyRoomRefresh(reason = 'unspecified', delay = LOBBY_ROOM_REFRESH_DELAY_MS) {
  if (!isHost) return;

  if (lobbyRoomRefreshTimer) {
    clearTimeout(lobbyRoomRefreshTimer);
  }

  lobbyRoomRefreshTimer = setTimeout(() => {
    lobbyRoomRefreshTimer = null;
    void syncLobbyRoomState({
      force: true,
      eventName: 'room:update',
      reason,
    });
  }, delay);

  lobbyStateDebug('scheduleLobbyRoomRefresh', {
    reason,
    delay,
    roomId,
  });
}

async function syncLobbyRoomState(options = {}) {
  const {
    force = false,
    eventName = 'room:update',
    reason = 'unspecified',
  } = options;

  if (!currentUser || !lobbyChannel || !roomId || !isHost || lobbyConnectionState !== LOBBY_CONNECTION_STATE.READY) {
    resetPublishedLobbyRoomState();
    lobbyStateDebug('syncLobbyRoomState:skip', {
      force,
      eventName,
      reason,
      hasCurrentUser: Boolean(currentUser),
      hasLobbyChannel: Boolean(lobbyChannel),
      roomId: roomId || null,
      isHost: Boolean(isHost),
      lobbyConnectionState: typeof lobbyConnectionState === 'string' ? lobbyConnectionState : 'unknown',
    });
    return false;
  }

  const roomState = buildCurrentLobbyRoomState();
  if (!roomState) return false;
  applyCurrentLobbyRoomState(roomState, 'local');

  const serializedState = serializeLobbyRoomState(roomState);
  if (!force && eventName !== 'room:heartbeat' && serializedState === lastPublishedLobbyRoomStateKey) {
    lobbyStateDebug('syncLobbyRoomState:deduped', {
      eventName,
      reason,
      roomId: roomState.roomId,
    });
    return false;
  }

  if (eventName === 'room:close' || roomState.status === 'closed') {
    removeLobbyOpenRoom(roomState.roomId, 'local-close');
    resetPublishedLobbyRoomState();
    if (eventName === 'room:close') {
      await lobbyChannel.send({
        type: 'broadcast',
        event: 'room:close',
        payload: {
          roomId: roomState.roomId,
          hostSessionId: roomState.hostSessionId,
          hostUsername: roomState.hostUsername,
          updatedAt: Date.now(),
        },
      });
      lobbyStateDebug('syncLobbyRoomState:close', {
        reason,
        roomId: roomState.roomId,
      });
    }
    return true;
  }

  upsertLobbyOpenRoom(roomState, 'local');
  await lobbyChannel.send({
    type: 'broadcast',
    event: eventName,
    payload: roomState,
  });

  if (eventName !== 'room:heartbeat') {
    lastPublishedLobbyRoomStateKey = serializedState;
  }

  if (roomState.status === 'open') {
    ensureLobbyRoomHeartbeat();
  } else {
    stopLobbyRoomHeartbeat();
  }

  if (eventName !== 'room:heartbeat' || shouldLogLobbyHeartbeatDebug()) {
    lobbyStateDebug('syncLobbyRoomState:sent', {
      eventName,
      reason,
      roomId: roomState.roomId,
      status: roomState.status,
      playerCount: roomState.playerCount,
    });
  }
  return true;
}
