// ── Splash → Game transition ──────────────────────────────────────────────────
// A full-screen canvas snake sweeps from right to left, eating the splash page.
// Overlapping bite circles along its sinusoidal path form the chomp-mark edge.
// When the tail clears the left edge the canvas is removed and the game appears.

function startChompAnimation() {
  const splash = document.getElementById('splash');

  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;z-index:10001;pointer-events:none;';
  c.width  = window.innerWidth;
  c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');

  const W        = c.width;
  const H        = c.height;
  const SEG      = Math.round(Math.min(W, H) / 9); // segment size ~11% of shortest dim
  const SPEED    = W / 90;                          // full screen in ~1.5 s at 60 fps
  const AMP      = H * 0.28;                        // sine wave amplitude
  const FREQ     = (2 * Math.PI) / (W * 0.85);     // ~one full wave across screen
  const BITE_R   = SEG * 1.25;                      // radius of each bite circle
  const MAX_SEGS = 11;                              // visible body segments

  let headX    = W + SEG * (MAX_SEGS + 2);          // start off-screen right
  const path   = [];                                 // [{x,y}] newest → oldest

  function waveY(x) {
    return H / 2 + Math.sin(x * FREQ) * AMP;
  }

  // Dark eaten area: solid fill + overlapping bite circles along the snake's path
  function drawEaten() {
    if (!path.length) return;
    ctx.fillStyle = '#0d1117';
    const tailX = path[path.length - 1].x;
    if (tailX < W) ctx.fillRect(tailX, 0, W - tailX, H);
    for (let i = 0; i < path.length; i += 2) {
      ctx.beginPath();
      ctx.arc(path[i].x, path[i].y, BITE_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sample evenly-spaced body positions from the recorded path
  function sampleBody() {
    const positions = [path[0]];
    let dist = 0;
    for (let i = 1; i < path.length && positions.length < MAX_SEGS; i++) {
      const a = path[i - 1], b = path[i];
      dist += Math.hypot(b.x - a.x, b.y - a.y);
      if (dist >= SEG * 1.2) { positions.push(b); dist = 0; }
    }
    return positions;
  }

  function drawSnake() {
    const segs = sampleBody();
    const s    = SEG - 4;

    // Tail → head so the head renders on top
    for (let i = segs.length - 1; i >= 0; i--) {
      const { x, y } = segs[i];
      const isHead   = i === 0;
      const alpha    = (1 - (i / Math.max(segs.length - 1, 1)) * 0.55).toFixed(2);
      ctx.save();
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur  = isHead ? 24 : 10;
      ctx.fillStyle   = isHead ? '#39ff14' : `rgba(57,255,20,${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x - s / 2, y - s / 2, s, s, s * 0.18);
      ctx.fill();
      ctx.restore();
    }

    // Eyes — snake faces left, eyes on left face
    if (segs.length) {
      const { x, y } = segs[0];
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#060810';
      ctx.beginPath(); ctx.arc(x - SEG * 0.16, y - SEG * 0.22, SEG * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x - SEG * 0.16, y + SEG * 0.22, SEG * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function tick() {
    headX -= SPEED;
    path.unshift({ x: headX, y: waveY(headX) });

    ctx.clearRect(0, 0, W, H);
    drawEaten();
    drawSnake();

    if (headX < -(SEG * (MAX_SEGS + 3) + BITE_R)) {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, W, H);
      setTimeout(() => { c.remove(); splash.style.display = 'none'; }, 180);
      return;
    }

    requestAnimationFrame(tick);
  }

  tick();
}
