/*
 * Multiplayer lobby debug controls
 *
 * Enable all lobby logs:
 *   ?debugLobby=1
 *
 * Enable specific topics:
 *   ?debugLobby=lifecycle,handoff,room_state
 *   ?debugLobby=lifecycle,handoff,room_state,heartbeat
 *
 * Available topics:
 *   lifecycle, handoff, room_state, presence, discovery, ui, heartbeat
 *
 * Disable a stored override:
 *   localStorage.removeItem('snake_debug_lobby')
 *
 * Precedence:
 *   1. URL query param `debugLobby`
 *   2. localStorage key `snake_debug_lobby`
 *   3. localhost dev default (`lifecycle,handoff,room_state`)
 */
(function initMultiplayerDebug(global) {
  const DEBUG_STORAGE_KEY = 'snake_debug_lobby';
  const DEBUG_QUERY_PARAM = 'debugLobby';
  const ALL_TOPICS = '*';
  const DEFAULT_NAMESPACE = 'lobby';
  const LOCAL_DEV_DEFAULT_DEBUG_VALUE = 'lifecycle,handoff,room_state';
  const DEBUG_SESSION_STARTED_AT_MS = Date.now();

  function readQueryDebugValue() {
    try {
      const params = new URLSearchParams(global.location.search);
      return params.get(DEBUG_QUERY_PARAM);
    } catch (error) {
      return null;
    }
  }

  function writeStoredDebugValue(rawValue) {
    try {
      if (!rawValue || rawValue === '0') {
        global.localStorage.removeItem(DEBUG_STORAGE_KEY);
        return;
      }
      global.localStorage.setItem(DEBUG_STORAGE_KEY, rawValue);
    } catch (error) {}
  }

  function readStoredDebugValue() {
    try {
      return global.localStorage.getItem(DEBUG_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function isLocalDevHost() {
    try {
      const hostname = String(global.location.hostname || '').toLowerCase();
      return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1';
    } catch (error) {
      return false;
    }
  }

  function normalizeTopic(topic) {
    if (typeof topic !== 'string') return null;
    const normalized = topic.trim().toLowerCase();
    return normalized || null;
  }

  function parseDebugSetting(rawValue) {
    if (typeof rawValue !== 'string') {
      return {
        enabled: false,
        allTopics: false,
        topics: new Set(),
      };
    }

    const value = rawValue.trim();
    if (!value || value === '0') {
      return {
        enabled: false,
        allTopics: false,
        topics: new Set(),
      };
    }

    if (value === '1') {
      return {
        enabled: true,
        allTopics: true,
        topics: new Set([ALL_TOPICS]),
      };
    }

    const topics = new Set(
      value
        .split(',')
        .map((entry) => normalizeTopic(entry))
        .filter(Boolean)
    );

    if (!topics.size) {
      return {
        enabled: false,
        allTopics: false,
        topics: new Set(),
      };
    }

    if (topics.has(ALL_TOPICS) || topics.has('all')) {
      return {
        enabled: true,
        allTopics: true,
        topics: new Set([ALL_TOPICS]),
      };
    }

    return {
      enabled: true,
      allTopics: false,
      topics,
    };
  }

  function applyQueryOverride() {
    const queryValue = readQueryDebugValue();
    if (queryValue === null) return;
    writeStoredDebugValue(queryValue);
  }

  function getEffectiveDebugConfig() {
    const queryValue = readQueryDebugValue();
    if (queryValue !== null) {
      return parseDebugSetting(queryValue);
    }

    const storedValue = readStoredDebugValue();
    if (storedValue !== null) {
      return parseDebugSetting(storedValue);
    }

    if (isLocalDevHost()) {
      return parseDebugSetting(LOCAL_DEV_DEFAULT_DEBUG_VALUE);
    }

    return parseDebugSetting(null);
  }

  function inferLobbyDebugTopic(eventName) {
    if (typeof eventName !== 'string') return 'lifecycle';

    if (
      eventName.startsWith('renderAvailableRooms:') ||
      eventName.startsWith('requestLobbyRoomRegistry:') ||
      eventName.startsWith('lobbyRoomState:')
    ) {
      return 'discovery';
    }

    if (
      eventName.startsWith('syncLobbyPresence:') ||
      eventName.startsWith('lobbyChannel:presence-sync') ||
      eventName.startsWith('roomChannel:presence-sync') ||
      eventName.startsWith('pendingDepartedRoomSession:')
    ) {
      return 'presence';
    }

    if (
      eventName.startsWith('currentLobbyRoomState:') ||
      eventName.startsWith('syncLobbyRoomState:') ||
      eventName.startsWith('scheduleLobbyRoomRefresh')
    ) {
      return 'room_state';
    }

    if (
      eventName.startsWith('broadcastLobbyHostHandoff') ||
      eventName.startsWith('syncHostAssignment:') ||
      eventName.startsWith('hostResolutionRecheck:') ||
      eventName.startsWith('recentHostRelinquish:') ||
      eventName.startsWith('incomingRoomState:')
    ) {
      return 'handoff';
    }

    if (eventName.startsWith('lobbyUiState:')) {
      return 'ui';
    }

    return 'lifecycle';
  }

  function isDebugTopicEnabled(topic, namespace = DEFAULT_NAMESPACE) {
    if (namespace !== DEFAULT_NAMESPACE) return false;

    const config = getEffectiveDebugConfig();
    if (!config.enabled) return false;
    if (config.allTopics) return true;

    const normalizedTopic = normalizeTopic(topic) || 'lifecycle';
    return config.topics.has(normalizedTopic);
  }

  function buildPrefix(namespace, sessionId) {
    const sessionSuffix = typeof sessionId === 'string'
      ? sessionId.slice(-4)
      : '????';
    return `[snake:${namespace}:${sessionSuffix}]`;
  }

  function padDebugNumber(value, width = 2) {
    return String(value).padStart(width, '0');
  }

  function formatDebugClockTime(timestampMs) {
    const date = new Date(timestampMs);
    return `${padDebugNumber(date.getHours())}:${padDebugNumber(date.getMinutes())}:${padDebugNumber(date.getSeconds())}.${padDebugNumber(date.getMilliseconds(), 3)}`;
  }

  function formatDebugElapsed(timestampMs) {
    return `+${Math.max(0, timestampMs - DEBUG_SESSION_STARTED_AT_MS)}ms`;
  }

  function debugLog(namespace, eventName, details = null, options = {}) {
    const normalizedNamespace = normalizeTopic(namespace) || DEFAULT_NAMESPACE;
    const topic = normalizeTopic(options.topic)
      || (normalizedNamespace === DEFAULT_NAMESPACE
        ? inferLobbyDebugTopic(eventName)
        : 'lifecycle');

    if (!isDebugTopicEnabled(topic, normalizedNamespace)) return;

    const timestampMs = Date.now();
    const prefix = `${buildPrefix(normalizedNamespace, options.sessionId)}[${formatDebugElapsed(timestampMs)}][${formatDebugClockTime(timestampMs)}]`;
    if (details === null) {
      console.debug(`${prefix} ${eventName}`);
      return;
    }

    console.debug(`${prefix} ${eventName}`, details);
  }

  applyQueryOverride();

  global.mpIsDebugEnabled = isDebugTopicEnabled;
  global.mpDebugLog = debugLog;
  global.mpInferLobbyDebugTopic = inferLobbyDebugTopic;
})(window);
