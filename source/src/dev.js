// ============================================================================
// development tools: only in dev.html (npm run build:dev), never in index.html
// ============================================================================
//   F    fly the camera along the scripted path (FLY in main.js), one minute through the whole world
//   B    the same flight as a benchmark: the resolution stays fixed, every frame is timed, the result is shown at the end
//   F, B or 1-6 during a flight stop it
//   K, T, G, V  game tests: spawn one alien of each kind, hold the trigger, take no harm, hide the game's models
{
  const LOGN = 1 << 16, logFrame = new Float32Array(LOGN), logGpu = new Float32Array(LOGN);
  let flying = false, bench = false, last = 0, nFrame = 0, nGpu = 0;
  const stop = () => { flying = bench = false; dynT = 0; };
  const report = () => {
    const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: sum / n, p99: s[min(n - 1, floor(n * 0.99))], max: s[n - 1] }; };
    const fm = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;
    const f = st(logFrame, nFrame);
    info.textContent = `Fly-through ${W}x${H}, ${f.n} frames\nframe  ${fm(f)}\nGPU    ${nGpu ? fm(st(logGpu, nGpu)) : 'timestamp-query unavailable'}`;
  };
  // frame() moves the free camera and then calls render(): step in between and put the camera on the path instead
  const draw = render;
  render = () => {
    if (flying) {
      const dtr = F[LAST] - last; last = F[LAST];
      F[FLT] += min(dtr / 1000, 0.1); flyAt();
      if (bench) { if (nFrame < LOGN) logFrame[nFrame++] = dtr; if (F[GPU] > 0 && nGpu < LOGN) logGpu[nGpu++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    draw();
  };
  let god = false; setInterval(() => { if (god) { hp = suit = coreHP = 100; } }, 50);
  // a shader or pipeline that failed validation is easy to miss: put the first error on screen
  setInterval(() => { if (gpuErr) info.textContent = 'GPU error: ' + gpuErr.slice(0, 600); }, 1000);
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    const code = codeOf(e);
    if (code === 'KeyF' || code === 'KeyB') {
      if (flying) stop();
      else {
        flying = true; bench = code === 'KeyB'; F[FLT] = 0; last = F[LAST]; nFrame = nGpu = 0;
        // a benchmark hides the stats line and holds the resolution: dynT at -Infinity keeps frame() from tuning it
        if (bench) { hud = false; info.textContent = ''; dynT = -Infinity; }
      }
    } else if (/Digit[1-6]/.test(code)) stop();
    // K: one alien of each kind in front of the camera. T: hold / release the trigger. G: the diver and the core take no harm
    else if (code === 'KeyK') { gameStart(); for (let k = 0; k < 4; k++) spawn(k, F[CX] + F[FX] * 7 + F[RX] * (k - 1.5) * 2.4, F[CY] + F[FY] * 7 + 0.5, F[CZ] + F[FZ] * 7 + F[RZ] * (k - 1.5) * 2.4); }
    else if (code === 'KeyT') trig = 1 - trig;
    else if (code === 'KeyG') god = !god;
    else if (code === 'KeyV') gHide = !gHide;
  });
}
