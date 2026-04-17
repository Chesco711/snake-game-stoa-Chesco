(function initMenuBackgroundSnake() {
  const MENU_SNAKE_APPEARANCES = [
    { type: 'color', color: '#39ff14', weight: 10 },
    { type: 'color', color: '#FF6B6B', weight: 6 },
    { type: 'color', color: '#4ECDC4', weight: 5 },
    { type: 'color', color: '#FFE66D', weight: 4 },
    { type: 'color', color: '#A8E6CF', weight: 3 },
    { type: 'invincible', weight: 1 },
  ];
  const MENU_SNAKE_LENGTH_BUCKETS = [
    { min: 3, max: 3, weight: 1 },
    { min: 4, max: 5, weight: 10 },
    { min: 6, max: 8, weight: 5 },
    { min: 9, max: 11, weight: 2 },
    { min: 12, max: 15, weight: 1 },
  ];

  const canvas = document.getElementById('menu-bg-snake-layer');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const state = {
    cellSize: 20,
    cols: 0,
    rows: 0,
    dpr: 1,
    phase: 'waiting',
    waitUntil: performance.now() + randomWaitMs(),
    snake: [],
    direction: { x: 1, y: 0 },
    nextStepAt: 0,
    stepMs: 170,
    turnsRemaining: 0,
    turnsUntilNext: null,
    appearance: MENU_SNAKE_APPEARANCES[0],
    length: 4,
    activeLastFrame: false,
  };

  function randomWaitMs() {
    return 6000 + Math.random() * 24000;
  }

  function isLayerActive() {
    const entryEl = document.getElementById('mp-entry');
    const lobbyEl = document.getElementById('mp-lobby');
    const canvasWrapEl = document.getElementById('canvas-wrap');
    if (!entryEl || !lobbyEl || !canvasWrapEl) return false;

    const entryVisible = window.getComputedStyle(entryEl).display !== 'none';
    const lobbyVisible = window.getComputedStyle(lobbyEl).display !== 'none';
    const gameplayVisible = window.getComputedStyle(canvasWrapEl).display !== 'none';

    return !gameplayVisible && (entryVisible || lobbyVisible);
  }

  function resizeLayer() {
    state.dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * state.dpr);
    canvas.height = Math.floor(window.innerHeight * state.dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.cols = Math.ceil(window.innerWidth / state.cellSize);
    state.rows = Math.ceil(window.innerHeight / state.cellSize);
  }

  function buildSpawn(edge, length) {
    const maxCol = Math.max(0, state.cols - 1);
    const maxRow = Math.max(0, state.rows - 1);
    const segments = Array.from({ length }, (_, index) => index + 1);

    if (edge === 'left') {
      const y = randomInt(2, Math.max(2, maxRow - 2));
      return {
        snake: segments.map((offset) => ({ x: -offset, y })),
        direction: { x: 1, y: 0 },
      };
    }

    if (edge === 'right') {
      const y = randomInt(2, Math.max(2, maxRow - 2));
      return {
        snake: segments.map((offset) => ({ x: maxCol + offset, y })),
        direction: { x: -1, y: 0 },
      };
    }

    if (edge === 'top') {
      const x = randomInt(2, Math.max(2, maxCol - 2));
      return {
        snake: segments.map((offset) => ({ x, y: -offset })),
        direction: { x: 0, y: 1 },
      };
    }

    const x = randomInt(2, Math.max(2, maxCol - 2));
    return {
      snake: segments.map((offset) => ({ x, y: maxRow + offset })),
      direction: { x: 0, y: -1 },
    };
  }

  function spawnSnake(now) {
    const edge = ['left', 'right', 'top', 'bottom'][randomInt(0, 3)];
    state.length = chooseSnakeLength();
    const spawn = buildSpawn(edge, state.length);
    state.snake = spawn.snake;
    state.direction = spawn.direction;
    state.appearance = chooseAppearance();
    state.phase = 'moving';
    state.nextStepAt = now;

    const straightSpan = state.direction.x !== 0 ? state.cols : state.rows;
    state.turnsRemaining = chooseTurnCount();
    state.turnsUntilNext = state.turnsRemaining > 0
      ? nextTurnDelay(straightSpan)
      : null;
  }

  function randomInt(min, max) {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return Math.floor(lower + Math.random() * (upper - lower + 1));
  }

  function chooseAppearance() {
    const totalWeight = MENU_SNAKE_APPEARANCES.reduce((sum, appearance) => sum + appearance.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const appearance of MENU_SNAKE_APPEARANCES) {
      roll -= appearance.weight;
      if (roll < 0) return appearance;
    }

    return MENU_SNAKE_APPEARANCES[0];
  }

  function chooseWeightedBucket(buckets) {
    const totalWeight = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const bucket of buckets) {
      roll -= bucket.weight;
      if (roll < 0) return bucket;
    }

    return buckets[0];
  }

  function chooseSnakeLength() {
    const bucket = chooseWeightedBucket(MENU_SNAKE_LENGTH_BUCKETS);
    return randomInt(bucket.min, bucket.max);
  }

  function hexToRgba(hex, alpha) {
    const normalized = hex.replace('#', '');
    const expanded = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;
    const intValue = Number.parseInt(expanded, 16);
    const r = (intValue >> 16) & 255;
    const g = (intValue >> 8) & 255;
    const b = intValue & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function chooseTurnCount() {
    const roll = Math.random();
    if (roll < 0.28) return 0;
    if (roll < 0.73) return 1;
    if (roll < 0.95) return 2;
    return 3;
  }

  function nextTurnDelay(straightSpan) {
    const minTurnSteps = 5;
    const maxTurnSteps = Math.max(minTurnSteps, Math.floor(straightSpan * 0.45));

    if (Math.random() < 0.12) {
      return randomInt(2, 4);
    }

    return randomInt(minTurnSteps, maxTurnSteps);
  }

  function maybeTurnSnake() {
    if (state.turnsRemaining <= 0 || state.turnsUntilNext === null) return;

    state.turnsUntilNext -= 1;
    if (state.turnsUntilNext > 0) return;

    if (state.direction.x !== 0) {
      state.direction = { x: 0, y: Math.random() < 0.5 ? -1 : 1 };
    } else {
      state.direction = { x: Math.random() < 0.5 ? -1 : 1, y: 0 };
    }

    state.turnsRemaining -= 1;
    if (state.turnsRemaining <= 0) {
      state.turnsUntilNext = null;
      return;
    }

    const straightSpan = state.direction.x !== 0 ? state.cols : state.rows;
    state.turnsUntilNext = nextTurnDelay(straightSpan);
  }

  function resetToWaiting(now, delayMs = randomWaitMs()) {
    state.phase = 'waiting';
    state.waitUntil = now + delayMs;
    state.snake = [];
    state.turnsRemaining = 0;
    state.turnsUntilNext = null;
    state.appearance = MENU_SNAKE_APPEARANCES[0];
    state.length = 4;
  }

  function stepSnake() {
    maybeTurnSnake();
    const head = state.snake[0];
    const nextHead = {
      x: head.x + state.direction.x,
      y: head.y + state.direction.y,
    };

    state.snake.unshift(nextHead);
    state.snake.pop();

    const allSegmentsOutOfView = state.snake.every((segment) =>
      segment.x < -4 ||
      segment.y < -4 ||
      segment.x > state.cols + 4 ||
      segment.y > state.rows + 4
    );

    if (allSegmentsOutOfView) {
      resetToWaiting(performance.now(), randomWaitMs());
    }
  }

  function clearLayer() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function drawRoundedRect(x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawSnake() {
    clearLayer();
    if (!state.snake.length) return;

    const now = Date.now();
    const appearance = state.appearance || MENU_SNAKE_APPEARANCES[0];

    state.snake.forEach((segment, index) => {
      const x = segment.x * state.cellSize + 1;
      const y = segment.y * state.cellSize + 1;
      const size = state.cellSize - 2;
      const isHead = index === 0;

      if (appearance.type === 'invincible') {
        const hue = (now / 25 + index * 18) % 360;

        if (isHead) {
          ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
          ctx.shadowBlur = 16;
          ctx.fillStyle = `hsl(${hue}, 100%, 72%)`;
        } else {
          const pulse = 0.55 + 0.45 * Math.sin(now / 140 + index * 0.4);
          ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
          ctx.shadowBlur = 22 * pulse;
          ctx.fillStyle = `hsl(${hue}, 100%, 58%)`;
        }
      } else if (isHead) {
        ctx.shadowColor = appearance.color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = appearance.color;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = hexToRgba(appearance.color, 0.65 - (index / state.snake.length) * 0.3);
      }

      drawRoundedRect(x, y, size, size, isHead ? 5 : 3);
      ctx.fill();
    });

    ctx.shadowBlur = 0;

    const head = state.snake[0];
    const eyeOffset = 5;
    const eyeRadius = 2.5;
    const eyePositions = getEyePositions(head.x * state.cellSize, head.y * state.cellSize, state.direction, eyeOffset);

    ctx.fillStyle = '#111';
    eyePositions.forEach(([eyeX, eyeY]) => {
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function getEyePositions(headX, headY, direction, offset) {
    const centerX = headX + state.cellSize / 2;
    const centerY = headY + state.cellSize / 2;

    if (direction.x === 1) return [[centerX + 4, centerY - offset], [centerX + 4, centerY + offset]];
    if (direction.x === -1) return [[centerX - 4, centerY - offset], [centerX - 4, centerY + offset]];
    if (direction.y === -1) return [[centerX - offset, centerY - 4], [centerX + offset, centerY - 4]];
    return [[centerX - offset, centerY + 4], [centerX + offset, centerY + 4]];
  }

  function tick(now) {
    const active = isLayerActive();

    if (!active) {
      if (state.activeLastFrame) {
        clearLayer();
      }
      state.activeLastFrame = false;
      requestAnimationFrame(tick);
      return;
    }

    if (!state.activeLastFrame) {
      resetToWaiting(now);
    }

    state.activeLastFrame = true;

    if (state.phase === 'waiting' && now >= state.waitUntil) {
      spawnSnake(now);
    }

    if (state.phase === 'moving' && now >= state.nextStepAt) {
      while (now >= state.nextStepAt && state.phase === 'moving') {
        stepSnake();
        state.nextStepAt += state.stepMs;
      }
    }

    drawSnake();
    requestAnimationFrame(tick);
  }

  resizeLayer();
  window.addEventListener('resize', resizeLayer);
  requestAnimationFrame(tick);
})();
