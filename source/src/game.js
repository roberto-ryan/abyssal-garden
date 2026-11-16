// ============================================================================
// the game: rift defense
// ============================================================================
// Aliens come through rifts in waves and go for the diver and for the resonance core on the seabed. The mission ends
// when either is lost. Four kinds, all swimmers:
//   leaper   small, in packs, lunges and bites
//   spitter  keeps its distance and lobs acid
//   stalker  big, circles, then charges with its jaws
//   caster   hovers above its target and throws pairs of homing orbs, mostly at the core
// Everything lives in preallocated typed arrays, so the frame loop still allocates nothing; the HUD (plain HTML) is
// only touched when a shown number changes.
// main.js calls gameTick (simulation, paused behind the menu), gamePrep (instance data for this frame), gameDraw
// (aliens, weapon, core) and gameFx (sprites and beams).

// ---------------------------------------------------------------- meshes (sculpted in models.js)
let vbG, ibG;
{
  let nv = 0, ni = 0;
  for (const m of GM) { m.v0 = nv; m.i0 = ni; m.n = m.ib.length; nv += m.nv; ni += m.n; }
  const v = new Uint8Array(nv * 20), ix = new Uint32Array(ni);
  for (const m of GM) { v.set(new Uint8Array(m.vb), m.v0 * 20); ix.set(m.ib, m.i0); m.vb = m.ib = 0; }
  vbG = buf(v, BU.VERTEX); ibG = buf(ix, BU.INDEX);
}

// ---------------------------------------------------------------- state
// aliens: ES floats each. eST: 0 free, 1 coming out of a rift, 2 alive, 3 dying. eTG: 0 hunts the diver, 1 the core.
const MAXE = 40, ES = 22, EN = new Float32Array(MAXE * ES);
const eVX = 3, eVY = 4, eVZ = 5, eDX = 6, eDY = 7, eDZ = 8, eHP = 9, eTYPE = 10, eST = 11, eT = 12, ePH = 13, eFL = 14, eTG = 15, eSEED = 16, eCD = 17, eAT = 18, eSTK = 19, eMODE = 20, eMT = 21;
//            leaper spitter stalker caster
// with the scanned models (TX) the stalker is a broad crab, not a long fish: one bigger sphere, claws closer in
const T_R = [0.42, 0.55, TX ? 1.1 : 0.8, 0.65], T_LEN = [0, 0.45, TX ? 0 : 1.3, 0], T_JAW = TX ? 0.6 : 1.7, T_HP = [24, 70, 240, 110], T_SPD = [4.4, 3.2, 6, 2.8], T_PTS = [10, 25, 75, 40];
// shots in flight: x y z, velocity, type (0 acid, 1 orb, 2 harpoon), life, target, last alien hit
const MAXJ = 48, JS = 10, PJ = new Float32Array(MAXJ * JS);
// pickups: x y z, type (0 health, 1 suit power, 2 darts, 3 harpoons, 4 lance cells), life, phase
const MAXK = 16, KS = 6, PK = new Float32Array(MAXK * KS);
const K_COL = new Float32Array([1, 0.2, 0.25, 0.15, 0.55, 1, 1, 0.65, 0.1, 0.85, 0.9, 0.8, 0.65, 0.25, 1]);
const K_DROP = [2, 2, 2, 3, 4, 1, 0], K_AMMO = [52, 4, 8]; // what a dead alien may leave, and how much ammunition a pickup holds
// particles: x y z, velocity, life, lifetime, size, colour (0 bubble, 1 alien blood, 2 acid, 3 ember, 4 arc, 5 silt)
const MAXP = 512, PS = 10, PT = new Float32Array(MAXP * PS);
const P_COL = new Float32Array([0.5, 0.7, 0.8, 0.5, 0.7, 0.06, 0.2, 1, 0.12, 1, 0.45, 0.08, 0.2, 0.85, 1, 0.2, 0.18, 0.15]);
// beams: from, to, life, lifetime, width, colour (0 tracer, 1 lance, 2 rift lightning)
const MAXB = 32, BS = 10, BM = new Float32Array(MAXB * BS);
const B_COL = new Float32Array([0.7, 0.85, 1, 0.3, 1.3, 1.6, 0.4, 1.5, 0.5]);
// rifts: x y z, age, duration
const MAXR = 6, RS = 5, RF = new Float32Array(MAXR * RS);
// GPU instances: 0 the weapon, 1 the core, 2.. the aliens; sprites fill FXD from the front, beams from the back
const MAXFX = 768, GI = new Float32Array((MAXE + 2) * 12), FXD = new Float32Array(MAXFX * 12);
const ibGI = device.createBuffer({ size: GI.byteLength, usage: BU.VERTEX | BU.COPY_DST }), ibFX = device.createBuffer({ size: FXD.byteLength, usage: BU.VERTEX | BU.COPY_DST });
let nS = 0, nB = 0, ptI = 0, bmI = 0, rfI = 0;

const W_NAME = [TX ? 'SALVAGED RIFLE' : 'APS-9 DART RIFLE', 'HARPOON GUN', 'ARC LANCE'], W_MAG = [26, 1, 6], W_RATE = [0.105, 0.5, 0.7], W_RLD = [2.1, 1.3, 2.4], W_MAX = [234, 16, 30], W_ZOOM = [0.42, 0.3, 0.45];
const mags = new Int32Array(3), spare = new Int32Array(3);
const coreY = CORE[1] + 1.95; // the crystal
let gOn = false, gOver = 0, hp = 100, suit = 0, coreHP = 100, score = 0, kills = 0, wave = 0, waveOn = false, waveT = 0, alive = 0, hpMul = 1;
let fireT = 0, rldT = 0, swapT = 0, kick = 0, heat = 0, hitT = 0, flashT = 0, glow = 0, adsK = 0, vmYaw = 0, vmPit = 0, bobT = 0;
let fxHurt = 0, fxPick = 0, coreFl = 0, coreMsgT = 0, coreSndT = 0, msgT = 0;
let qN = 0, qI = 0, spawnT = 0, riftN = 0, rfX = 0, rfY = 0, rfZ = 0, spX = 0, spY = 0, spZ = 0, mzX = 0, mzY = 0, mzZ = 0;
const QU = new Uint8Array(96);
// camera basis: forward, right (horizontal), up
let bfx = 0, bfy = 0, bfz = -1, brx = 1, brz = 0, bux = 0, buy = 1, buz = 0;
function basis() {
  const cp = cos(F[PIT]); bfy = sin(F[PIT]); brx = cos(F[YAW]); brz = sin(F[YAW]); bfx = cp * brz; bfz = -cp * brx;
  bux = -brz * bfy; buy = brz * bfx - brx * bfz; buz = brx * bfy;
}
// rotation that turns -Z to the direction (yaw, pitch), written to A[o..o+3]
function quat(A, o, yaw, pit) { const sy = sin(-yaw / 2), cy = cos(-yaw / 2), sx = sin(pit / 2), cx = cos(pit / 2); A[o] = cy * sx; A[o + 1] = sy * cx; A[o + 2] = -sy * sx; A[o + 3] = cy * cx; }
const sfx = (n, a) => { if (SFX) SFX[n](a); };

// ---------------------------------------------------------------- HUD
const dHp = $('hp'), dAr = $('ar'), dMg = $('mg'), dRs = $('rs'), dWn = $('wn'), dTp = $('tp'), dCf = $('cf'), dMs = $('ms'), dX = $('x'), dV = $('v');
let sHp = -1, sAr = -1, sMg = -1, sRs = -1, sW = -1, sWave = -1, sLeft = -1, sScore = -1, sCore = -1, sHit = false, sLow = false;
function paint() {
  const h = Math.ceil(hp), a = Math.ceil(suit), c = Math.ceil(coreHP), left = waveOn ? alive + qN - qI : -Math.ceil(waveT);
  if (h !== sHp) { sHp = h; dHp.textContent = h; }
  if (a !== sAr) { sAr = a; dAr.textContent = a; }
  if (mags[wpn] !== sMg) { sMg = mags[wpn]; dMg.textContent = sMg; }
  if (spare[wpn] !== sRs) { sRs = spare[wpn]; dRs.textContent = sRs; }
  if (wpn !== sW) { sW = wpn; dWn.textContent = W_NAME[wpn]; }
  if (c !== sCore) { sCore = c; sScore = -1; dCf.style.transform = `scaleX(${c / 100})`; dCf.style.background = c < 30 ? '#ff3b1f' : '#35e6ff'; }
  if (wave !== sWave || left !== sLeft || score !== sScore) {
    sWave = wave; sLeft = left; sScore = score;
    dTp.textContent = (waveOn ? `WAVE ${wave} · HOSTILES ${left}` : `WAVE ${wave + 1} IN ${-left}`) + ` · SCORE ${score} · CORE ${c}%`;
  }
  if (hitT > 0 !== sHit) { sHit = hitT > 0; dX.className = sHit ? 'h' : ''; }
  if (h < 30 !== sLow) { sLow = h < 30; dV.className = sLow ? 'w' : ''; }
}
const msg = (t, secs) => { dMs.textContent = t; dMs.style.opacity = 1; msgT = secs; };

// ---------------------------------------------------------------- world queries
const solidAt = (x, y, z) => y > -1 || y < -53 || x * x + z * z > 23000 || sdAt(x, y, z) > 0;
// distance along a ray to the rock (or the edge of the world), at most `far`
function rayRock(ox, oy, oz, dx, dy, dz, far) {
  let t = 0;
  while (t < far) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y > -0.5 || y < -53.5 || x * x + z * z > 24000) return t;
    const s = sdAt(x, y, z); if (s > -0.03) return t;
    t += s < -0.3 ? -s * 0.9 : 0.27;
  }
  return far;
}
// where a ray meets alien i (its one to three spheres, grown by `infl`): the distance, or -1
function hitE(i, ox, oy, oz, dx, dy, dz, infl) {
  const o = i * ES, ty = EN[o + eTYPE], R = T_R[ty] * infl, L = T_LEN[ty]; let best = -1;
  for (let k = L ? -1 : 0; k <= (L ? 1 : 0); k++) {
    const cx = EN[o] + EN[o + eDX] * L * k - ox, cy = EN[o + 1] + EN[o + eDY] * L * k - oy, cz = EN[o + 2] + EN[o + eDZ] * L * k - oz;
    const b = cx * dx + cy * dy + cz * dz, c = cx * cx + cy * cy + cz * cz - R * R, q = b * b - c;
    if (q < 0) continue;
    let t = b - sqrt(q); if (t < 0) { if (c > 0) continue; t = 0; }
    if (best < 0 || t < best) best = t;
  }
  return best;
}
// open water within r0..r1 of a point and not next to the diver, for a rift: result in spX, spY, spZ
function findSpot(cx, cy, cz, r0, r1) {
  for (let k = 0; k < 40; k++) {
    const a = rnd() * TAU, r = rr(r0, r1), x = cx + cos(a) * r, z = cz + sin(a) * r, y = clamp(cy + rr(-1, 9), -47, -8);
    if (sdAt(x, y, z) > -0.95 || sdAt(x, y + 2, z) > -0.95 || sdAt(x, y - 2, z) > -0.95 || sdAt(x + 2, y, z) > -0.95 || sdAt(x - 2, y, z) > -0.95 || sdAt(x, y, z + 2) > -0.95 || sdAt(x, y, z - 2) > -0.95) continue;
    const px = x - F[CX], py = y - F[CY], pz = z - F[CZ]; if (px * px + py * py + pz * pz < 100) continue;
    spX = x; spY = y; spZ = z; return;
  }
  spX = cx; spY = min(cy + 12, -6); spZ = cz;
}

// ---------------------------------------------------------------- effects
function puff(x, y, z, vx, vy, vz, life, size, col) {
  const o = ptI * PS; ptI = (ptI + 1) % MAXP;
  PT[o] = x; PT[o + 1] = y; PT[o + 2] = z; PT[o + 3] = vx; PT[o + 4] = vy; PT[o + 5] = vz; PT[o + 6] = PT[o + 7] = life; PT[o + 8] = size; PT[o + 9] = col;
}
function spray(x, y, z, n, speed, life, size, col) { for (let i = 0; i < n; i++) puff(x, y, z, rr(-1, 1) * speed, rr(-1, 1) * speed, rr(-1, 1) * speed, life * rr(0.6, 1.2), size * rr(0.6, 1.4), col); }
function beam(ax, ay, az, bx, by, bz, life, width, col) {
  const o = bmI * BS; bmI = (bmI + 1) % MAXB;
  BM[o] = ax; BM[o + 1] = ay; BM[o + 2] = az; BM[o + 3] = bx; BM[o + 4] = by; BM[o + 5] = bz; BM[o + 6] = BM[o + 7] = life; BM[o + 8] = width; BM[o + 9] = col;
}
function openRift(x, y, z) {
  const o = rfI * RS; rfI = (rfI + 1) % MAXR;
  RF[o] = x; RF[o + 1] = y; RF[o + 2] = z; RF[o + 3] = 0; RF[o + 4] = 3.2;
  spray(x, y, z, 12, 3, 1, 0.2, 2); sfx('rift');
}
function drop(x, y, z, type) {
  for (let i = 0; i < MAXK; i++) { const o = i * KS; if (PK[o + 4] <= 0) { PK[o] = x; PK[o + 1] = y; PK[o + 2] = z; PK[o + 3] = type; PK[o + 4] = 45; PK[o + 5] = rnd() * 6; return; } }
}

// ---------------------------------------------------------------- damage
function hurt(d) {
  if (pDead || gOver) return;
  const a = min(suit, d * 0.6); suit -= a; hp -= d - a; fxHurt = min(1, fxHurt + d / 30); sfx('hurt');
  if (hp <= 0) { hp = 0; pDead = true; over('YOU DIED'); }
}
function hurtCore(d) {
  if (gOver) return;
  coreHP -= d; coreFl = 1;
  if (coreSndT <= 0) { sfx('core'); coreSndT = 0.4; }
  if (coreMsgT <= 0) { msg('THE CORE IS UNDER ATTACK', 2); coreMsgT = 9; }
  if (coreHP <= 0) { coreHP = 0; spray(CORE[0], coreY, CORE[2], 40, 6, 2, 0.5, 3); spray(CORE[0], coreY, CORE[2], 30, 4, 2.5, 0.2, 0); over('THE CORE IS LOST'); }
}
function over(why) {
  gOver = 0.001; trig = ads = 0; sfx('over');
  msg(`${why}\nWAVES SURVIVED ${max(wave - 1, 0)} · KILLS ${kills} · SCORE ${score}\n${mob ? 'TAP' : 'CLICK'} TO REDEPLOY`, 1e9);
}
function damage(i, d, x, y, z) {
  const o = i * ES, ty = EN[o + eTYPE];
  EN[o + eHP] -= d; EN[o + eFL] = 1; hitT = 0.12;
  spray(x, y, z, 5, 1.5, 0.7, 0.16, 1);
  if (EN[o + eTG] && rnd() < 0.5) EN[o + eTG] = 0; // shot at: half the time it turns on the diver
  if (EN[o + eHP] > 0) return;
  EN[o + eST] = 3; EN[o + eT] = 0; score += T_PTS[ty]; kills++;
  spray(EN[o], EN[o + 1], EN[o + 2], 14, 2.5, 1.3, 0.3, 1); spray(EN[o], EN[o + 1], EN[o + 2], 6, 1.5, 1.5, 0.06, 0);
  sfx('die', ty);
  // what it leaves behind: health when the diver is hurt, otherwise mostly ammunition
  if (rnd() < 0.35) drop(EN[o], EN[o + 1], EN[o + 2], hp < 50 && rnd() < 0.5 ? 0 : K_DROP[rnd() * 7 | 0]);
}

// ---------------------------------------------------------------- weapons
// 0 dart rifle: automatic, hits at once, loses force with distance. 1 harpoon gun: one heavy bolt that flies, sinks a
// little and goes through. 2 arc lance: a beam through everything in line.
function muzzle() {
  const fw = TX && !wpn ? 0.66 : 0.52, rg = 0.085 * (1 - adsK), dn = 0.082 - 0.032 * adsK;
  mzX = F[CX] + bfx * fw + brx * rg - bux * dn; mzY = F[CY] + bfy * fw - buy * dn; mzZ = F[CZ] + bfz * fw + brz * rg - buz * dn;
}
function pick(i) { if (!gOn || pDead || i === wpn) return; wpn = i; swapT = 0.35; rldT = 0; }
function reload() {
  if (!gOn || pDead || rldT > 0 || mags[wpn] >= W_MAG[wpn] || !spare[wpn]) return;
  rldT = W_RLD[wpn]; sfx('reload');
}
function fire() {
  const w = wpn;
  if (!mags[w]) {
    if (spare[w]) return; // the reload follows (tickWeapons)
    // dry, and nothing to reload: on to a weapon that still has something
    fireT = 0.4; sfx('empty');
    for (let k = 1; k < 3; k++) { const j = (w + k) % 3; if (mags[j] || spare[j]) { pick(j); break; } }
    return;
  }
  mags[w]--; fireT = W_RATE[w]; kick = min(1, kick + (w ? 0.9 : 0.35)); flashT = 0.05;
  F[PIT] = min(1.55, F[PIT] + (w ? 0.03 : 0.006)); F[YAW] += rr(-1, 1) * (w ? 0.008 : 0.004);
  // the rifle scatters more from the hip and as the burst goes on
  const s = w ? 0 : (ads ? 0.003 : 0.011) * (1 + heat * 2), a = rr(-1, 1) * s, b = rr(-1, 1) * s; heat = min(1, heat + 0.12);
  let dx = bfx + brx * a + bux * b, dy = bfy + buy * b, dz = bfz + brz * a + buz * b; const l = sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
  muzzle();
  for (let i = 0; i < 3; i++) puff(mzX, mzY, mzZ, dx * rr(1, 4) + rr(-0.5, 0.5), dy * rr(1, 4) + rr(-0.5, 0.5), dz * rr(1, 4) + rr(-0.5, 0.5), rr(0.4, 0.9), rr(0.006, 0.016), 0);
  const cx = F[CX], cy = F[CY], cz = F[CZ];
  if (w === 1) { shoot(mzX, mzY, mzZ, dx * 45, dy * 45, dz * 45, 2, 0); sfx('harpoon'); return; }
  const far = w ? 90 : 70, tr = rayRock(cx, cy, cz, dx, dy, dz, far); let end = tr;
  if (w === 0) {
    let bi = -1;
    for (let i = 0; i < MAXE; i++) { const st = EN[i * ES + eST]; if (st === 1 || st === 2) { const t = hitE(i, cx, cy, cz, dx, dy, dz, 1); if (t >= 0 && t < end) { end = t; bi = i; } } }
    if (bi >= 0) damage(bi, 16 * (end < 14 ? 1 : max(0.4, 1 - (end - 14) / 50)), cx + dx * end, cy + dy * end, cz + dz * end);
    else if (tr < far) spray(cx + dx * (end - 0.15), cy + dy * (end - 0.15), cz + dz * (end - 0.15), 4, 0.8, 0.9, 0.2, 5);
    beam(mzX, mzY, mzZ, cx + dx * end, cy + dy * end, cz + dz * end, 0.09, 0.022, 0);
    // the dart's wake: a few bubbles along its path
    for (let i = 0; i < 3; i++) { const t = rr(1.5, min(end, 30)); puff(cx + dx * t, cy + dy * t, cz + dz * t, 0, 0.3, 0, rr(0.6, 1.4), rr(0.02, 0.04), 0); }
    sfx('rifle');
  } else {
    for (let i = 0; i < MAXE; i++) { const st = EN[i * ES + eST]; if (st === 1 || st === 2) { const t = hitE(i, cx, cy, cz, dx, dy, dz, 1.25); if (t >= 0 && t < tr) damage(i, 85, cx + dx * t, cy + dy * t, cz + dz * t); } }
    beam(mzX, mzY, mzZ, cx + dx * end, cy + dy * end, cz + dz * end, 0.3, 0.09, 1); glow = 1;
    if (tr < far) spray(cx + dx * (end - 0.2), cy + dy * (end - 0.2), cz + dz * (end - 0.2), 10, 3, 0.6, 0.15, 4);
    sfx('lance');
  }
}
function tickWeapons(dt) {
  fireT -= dt; swapT -= dt; hitT -= dt; flashT -= dt; kick *= exp(-dt * 9); heat = max(0, heat - dt * 1.5); glow *= exp(-dt * 4);
  if (rldT > 0 && (rldT -= dt) <= 0) { const n = min(W_MAG[wpn] - mags[wpn], spare[wpn]); mags[wpn] += n; spare[wpn] -= n; }
  // touch has no trigger: the weapon fires when an alien is in the sights and nothing is in the way
  let auto = false;
  if (tN > 0) {
    let best = wpn ? 70 : 45;
    for (let i = 0; i < MAXE; i++) if (EN[i * ES + eST] === 2) { const t = hitE(i, F[CX], F[CY], F[CZ], bfx, bfy, bfz, 1.5); if (t >= 0 && t < best) { best = t; auto = true; } }
    if (auto) auto = rayRock(F[CX], F[CY], F[CZ], bfx, bfy, bfz, best) >= best;
  }
  if (fireT <= 0 && rldT <= 0 && swapT <= 0) {
    if (trig || auto) fire();
    if (!mags[wpn] && spare[wpn]) reload(); // empty: reloads by itself
  }
  const aim = ads && rldT <= 0 && swapT <= 0;
  TANH += ((aim ? W_ZOOM[wpn] : 0.6) - TANH) * min(1, dt * 12); adsK += ((aim ? 1 : 0) - adsK) * min(1, dt * 12);
  vmYaw += (F[YAW] - vmYaw) * min(1, dt * 16); vmPit += (F[PIT] - vmPit) * min(1, dt * 16);
  bobT += dt * (1.3 + sqrt(F[VX] * F[VX] + F[VY] * F[VY] + F[VZ] * F[VZ]) * 0.8);
}

// ---------------------------------------------------------------- shots in flight
function shoot(x, y, z, vx, vy, vz, type, tg) {
  for (let i = 0; i < MAXJ; i++) {
    const o = i * JS;
    if (PJ[o + 7] <= 0) { PJ[o] = x; PJ[o + 1] = y; PJ[o + 2] = z; PJ[o + 3] = vx; PJ[o + 4] = vy; PJ[o + 5] = vz; PJ[o + 6] = type; PJ[o + 7] = type === 2 ? 3 : 6; PJ[o + 8] = tg; PJ[o + 9] = -1; return; }
  }
}
function tickShots(dt) {
  for (let i = 0; i < MAXJ; i++) {
    const o = i * JS; if (PJ[o + 7] <= 0) continue;
    const ty = PJ[o + 6], x0 = PJ[o], y0 = PJ[o + 1], z0 = PJ[o + 2]; let vx = PJ[o + 3], vy = PJ[o + 4], vz = PJ[o + 5], life = PJ[o + 7] - dt;
    if (ty === 0) vy -= 3 * dt; // acid sinks
    else if (ty === 1) { // orbs home in, slowly enough to be outswum
      const tg = PJ[o + 8] || pDead; let dx = (tg ? CORE[0] : F[CX]) - x0, dy = (tg ? coreY : F[CY]) - y0, dz = (tg ? CORE[2] : F[CZ]) - z0;
      const l = 8.5 / (sqrt(dx * dx + dy * dy + dz * dz) || 1), k = min(1, dt * 1.5); vx += (dx * l - vx) * k; vy += (dy * l - vy) * k; vz += (dz * l - vz) * k;
    } else { const k = exp(-dt * 0.25); vx *= k; vy = vy * k - 1.2 * dt; vz *= k; }
    const x = x0 + vx * dt, y = y0 + vy * dt, z = z0 + vz * dt;
    if (ty === 2) {
      if (rnd() < dt * 50) puff(x, y, z, 0, 0.2, 0, rr(0.5, 1.2), rr(0.015, 0.04), 0);
      // the bolt goes through aliens, losing speed in each
      const sl = sqrt(vx * vx + vy * vy + vz * vz) || 1, len = sl * dt;
      for (let j = 0; j < MAXE; j++) {
        const st = EN[j * ES + eST]; if ((st !== 1 && st !== 2) || j === PJ[o + 9]) continue;
        const t = hitE(j, x0, y0, z0, vx / sl, vy / sl, vz / sl, 1.15);
        if (t >= 0 && t <= len) { damage(j, 150, x0 + vx / sl * t, y0 + vy / sl * t, z0 + vz / sl * t); sfx('hit'); PJ[o + 9] = j; vx *= 0.6; vy *= 0.6; vz *= 0.6; if (sl < 20) life = 0; }
      }
      if (solidAt(x, y, z)) { spray(x, y, z, 5, 0.8, 0.9, 0.2, 5); life = 0; }
    } else {
      if (rnd() < dt * 30) puff(x, y, z, rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3), 0.5, 0.1, ty ? 3 : 2);
      const px = x - F[CX], py = y - F[CY], pz = z - F[CZ], cx = x - CORE[0], cy = y - coreY, cz = z - CORE[2], p2 = px * px + py * py + pz * pz;
      let hit = true;
      if (!pDead && p2 < 0.5) hurt(ty ? 11 : 13);
      else if (cx * cx + cy * cy + cz * cz < 2.2) hurtCore(ty ? 4 : 3);
      else if (solidAt(x, y, z)) { if (!ty && p2 < 5) hurt(5); } // acid splashes
      else hit = false;
      if (hit) { spray(x, y, z, 8, 2, 0.7, 0.18, ty ? 3 : 2); life = 0; }
    }
    PJ[o] = x; PJ[o + 1] = y; PJ[o + 2] = z; PJ[o + 3] = vx; PJ[o + 4] = vy; PJ[o + 5] = vz; PJ[o + 7] = life;
  }
}

// ---------------------------------------------------------------- aliens
function spawn(ty, x, y, z) {
  for (let i = 0; i < MAXE; i++) {
    const o = i * ES; if (EN[o + eST]) continue;
    EN.fill(0, o, o + ES); EN[o] = x; EN[o + 1] = y; EN[o + 2] = z; EN[o + eDZ] = -1;
    EN[o + eHP] = T_HP[ty] * hpMul; EN[o + eTYPE] = ty; EN[o + eST] = 1; EN[o + eT] = 0.7; EN[o + eSEED] = rnd();
    // stalkers hunt the diver, casters besiege the core, the rest split up
    EN[o + eTG] = ty === 2 ? 0 : ty === 3 ? 1 : rnd() < (ty ? 0.5 : 0.4) ? 1 : 0;
    EN[o + eCD] = 1 + rnd() * 2; EN[o + eMT] = 2 + rnd() * 3; alive++;
    return;
  }
}
// stuck or lost: it slips through a rift to somewhere near its target
function blink(o) {
  const tg = EN[o + eTG] || pDead;
  openRift(EN[o], EN[o + 1], EN[o + 2]);
  findSpot(tg ? CORE[0] : F[CX], tg ? coreY : F[CY], tg ? CORE[2] : F[CZ], 16, 26); openRift(spX, spY, spZ);
  EN[o] = spX; EN[o + 1] = spY; EN[o + 2] = spZ; EN[o + eVX] = EN[o + eVY] = EN[o + eVZ] = 0; EN[o + eST] = 1; EN[o + eT] = 0.7; EN[o + eSTK] = 0; EN[o + eAT] = 0;
}
function tickAliens(dt) {
  alive = 0;
  for (let i = 0; i < MAXE; i++) {
    const o = i * ES, st = EN[o + eST]; if (!st) continue;
    let x = EN[o], y = EN[o + 1], z = EN[o + 2], vx = EN[o + eVX], vy = EN[o + eVY], vz = EN[o + eVZ];
    if (st === 3) { // dying: drifts down and dissolves
      const k = exp(-dt * 1.5); EN[o] = x + vx * dt; EN[o + 1] = y + (vy - 0.4) * dt; EN[o + 2] = z + vz * dt; EN[o + eVX] = vx * k; EN[o + eVY] = vy * k; EN[o + eVZ] = vz * k;
      EN[o + ePH] += dt * 2; if ((EN[o + eT] += dt) > 1.3) EN[o + eST] = 0;
      continue;
    }
    alive++;
    const ty = EN[o + eTYPE], R = T_R[ty], spd = T_SPD[ty], sg = EN[o + eSEED] < 0.5 ? -1 : 1;
    if (st === 1 && (EN[o + eT] -= dt) <= 0) EN[o + eST] = 2;
    let fx = EN[o + eDX], fy = EN[o + eDY], fz = EN[o + eDZ];
    // distances are measured from the body, for the stalker from its jaws
    const hl = ty === 2 ? T_JAW : 0, hx = x + fx * hl, hy = y + fy * hl, hz = z + fz * hl;
    const ppx = F[CX] - hx, ppy = F[CY] - hy, ppz = F[CZ] - hz, pd = sqrt(ppx * ppx + ppy * ppy + ppz * ppz) || 1e-3;
    // target: its own, but the core once the diver is dead, and a caster turns on a diver who comes close
    let tg = pDead || (EN[o + eTG] && !(ty === 3 && pd < 11));
    if (coreHP <= 0) tg = false;
    const tX = tg ? CORE[0] : F[CX], tY = tg ? coreY : F[CY], tZ = tg ? CORE[2] : F[CZ];
    let dx = tX - hx, dy = tY - hy, dz = tZ - hz; const dist = sqrt(dx * dx + dy * dy + dz * dz) || 1e-3; dx /= dist; dy /= dist; dz /= dist;
    const cd = (EN[o + eCD] -= dt), was = EN[o + eAT], at = (EN[o + eAT] = was - dt), mt = (EN[o + eMT] -= dt);
    let wx = 0, wy = 0, wz = 0, acc = 3.5, free = false; // w: the velocity it wants
    if (ty === 0) {
      if (at > 0) { // in mid-lunge
        free = true;
        if (dist < R + (tg ? 1.3 : 0.8)) { if (tg) hurtCore(2); else { hurt(8); sfx('hit'); } EN[o + eAT] = 0; vx = -dx * 3; vy = 1 - dy * 3; vz = -dz * 3; }
      } else if (dist < 6.5 && cd <= 0 && st === 2) {
        vx = dx * 13; vy = dy * 13; vz = dz * 13; EN[o + eAT] = 0.55; EN[o + eCD] = 1.8 + rnd() * 1.5; free = true; if (!tg) sfx('leap');
      } else if (dist < 3.5) { wx = (-dz * sg - dx * 0.4) * spd; wy = 0.5 - dy * spd * 0.3; wz = (dx * sg - dz * 0.4) * spd; } // circles while it gathers itself
      else { const p = 0.5 + 0.8 * max(0, sin(EN[o + ePH] * 0.45)); wx = dx * spd * p; wy = dy * spd * p; wz = dz * spd * p; } // swims in pulses
    } else if (ty === 1) {
      if (dist > 19 || mt > 0) { wx = dx * spd; wy = dy * spd; wz = dz * spd; }
      else if (dist < 8) { wx = -dx * spd; wy = 1 - dy * spd; wz = -dz * spd; }
      else { wx = -dz * sg * spd * 0.5; wy = sin(EN[o + ePH] * 0.3) * 0.6 + clamp(dy * 2, -1, 1); wz = dx * sg * spd * 0.5; }
      if (cd <= 0 && st === 2 && dist < 26) {
        if (rayRock(x, y, z, dx, dy, dz, dist) >= dist - 1.6) {
          // lobbed ahead of a moving diver, and up against the sinking
          const T = dist / 15, k = tg ? 0 : T * 0.6; let ax = dx * dist + F[VX] * k, ay = dy * dist + F[VY] * k, az = dz * dist + F[VZ] * k; const al = 15 / (sqrt(ax * ax + ay * ay + az * az) || 1);
          shoot(x + dx * 0.7, y + dy * 0.7, z + dz * 0.7, ax * al, ay * al + 1.5 * T, az * al, 0, tg ? 1 : 0);
          EN[o + eCD] = 2.3 + rnd() * 1.4; EN[o + eFL] = 0.6; sfx('spit');
        } else { EN[o + eCD] = 0.6; EN[o + eMT] = 1.5; } // nothing to aim at from here: closes in
      }
    } else if (ty === 2) {
      const md = EN[o + eMODE];
      if (md === 0) { // circling
        const e = clamp((dist - 13) * 0.6, -3, 3);
        wx = -dz * sg * spd * 0.8 + dx * e; wy = clamp(tY + (tg ? 4 : 2) - y, -2, 2); wz = dx * sg * spd * 0.8 + dz * e;
        if (mt <= 0) { if (st === 2 && rayRock(hx, hy, hz, dx, dy, dz, dist) >= dist - 1.6) { EN[o + eMODE] = 1; EN[o + eMT] = 2.8; sfx('roar'); } else EN[o + eMT] = 1; }
      } else if (md === 1) { // the charge: fast, but it turns slowly
        wx = dx * 14; wy = dy * 14; wz = dz * 14; acc = 2.4;
        if (dist < (tg ? 2 : R + 0.8)) {
          if (tg) hurtCore(8); else { hurt(24); F[VX] += dx * 7; F[VY] += dy * 7; F[VZ] += dz * 7; sfx('hit'); }
          EN[o + eMODE] = 2; EN[o + eMT] = 1.6;
        } else if (mt <= 0) { EN[o + eMODE] = 2; EN[o + eMT] = 1; }
      } else { wx = -dx * spd; wy = 1.5 - dy * spd; wz = -dz * spd; if (mt <= 0) { EN[o + eMODE] = 0; EN[o + eMT] = 2 + rnd() * 3; } }
    } else {
      // hovers 13 m off its target and above it, drifting around
      const ox = hx - tX, oz = hz - tZ, ol = 13 / (sqrt(ox * ox + oz * oz) || 1);
      wx = clamp((tX + ox * ol - x) * 0.8, -spd, spd) - dz * sg * 0.7; wy = clamp((tY + 4.5 - y) * 0.8, -spd, spd) + sin(EN[o + ePH] * 0.25) * 0.4; wz = clamp((tZ + oz * ol - z) * 0.8, -spd, spd) + dx * sg * 0.7;
      if (cd <= 0 && st === 2 && dist < 24) { if (rayRock(x, y, z, dx, dy, dz, dist) >= dist - 1.6) { EN[o + eAT] = 0.9; EN[o + eCD] = 4 + rnd() * 1.5; sfx('charge'); } else EN[o + eCD] = 1; }
      if (was > 0 && at <= 0) { // charged: an orb from each hand
        for (let k = -1; k < 2; k += 2) shoot(x + fx * 0.6 - fz * 0.4 * k, y - 0.3, z + fz * 0.6 + fx * 0.4 * k, dx * 7 - dz * 3 * k, dy * 7 + 2, dz * 7 + dx * 3 * k, 1, tg ? 1 : 0);
        sfx('spit');
      }
    }
    if (free) { const k = exp(-dt * 0.8); vx *= k; vy *= k; vz *= k; }
    else {
      const wl = sqrt(wx * wx + wy * wy + wz * wz);
      if (wl > 0.5) {
        const a = 2.4 / wl;
        if (solidAt(x + wx * a, y + wy * a, z + wz * a)) { wy += spd * 1.3; wx *= 0.3; wz *= 0.3; } // rock ahead: over it
        EN[o + eSTK] = vx * vx + vy * vy + vz * vz < wl * wl * 0.06 ? EN[o + eSTK] + dt : max(0, EN[o + eSTK] - dt);
      }
      if (y > -4) wy -= (y + 4) * 2;
      const k = min(1, acc * dt); vx += (wx - vx) * k; vy += (wy - vy) * k; vz += (wz - vz) * k;
    }
    x += vx * dt; y += vy * dt; z += vz * dt;
    // out of the rock, sliding along it
    const s = sdAt(x, y, z) + min(R, 0.8);
    if (s > 0) {
      let gx = sdAt(x + 0.4, y, z) - sdAt(x - 0.4, y, z), gy = sdAt(x, y + 0.4, z) - sdAt(x, y - 0.4, z), gz = sdAt(x, y, z + 0.4) - sdAt(x, y, z - 0.4); const gl = sqrt(gx * gx + gy * gy + gz * gz);
      if (gl > 0.05) { gx /= gl; gy /= gl; gz /= gl; x -= gx * s; y -= gy * s; z -= gz * s; const vn = vx * gx + vy * gy + vz * gz; if (vn > 0) { vx -= gx * vn; vy -= gy * vn; vz -= gz * vn; } }
      else y += dt * 3; // deep inside: up and out
    }
    if (y < -52.5) y = -52.5; else if (y > -1.5) y = -1.5;
    const r2 = x * x + z * z; if (r2 > 21900) { const k = 148 / sqrt(r2); x *= k; z *= k; }
    // never inside the diver's mask
    if (!pDead) { const qx = F[CX] - x - fx * hl, qy = F[CY] - y - fy * hl, qz = F[CZ] - z - fz * hl, q = sqrt(qx * qx + qy * qy + qz * qz), m = (R + 0.55 - q) / q; if (m > 0 && q > 1e-3) { x -= qx * m; y -= qy * m; z -= qz * m; } }
    // leapers and stalkers face where they swim, the others their target
    const sp = sqrt(vx * vx + vy * vy + vz * vz), sw = (ty === 0 || ty === 2) && sp > 0.8, tk = min(1, dt * (ty === 2 ? 3 : 6));
    fx += ((sw ? vx / sp : dx) - fx) * tk; fy += ((sw ? vy / sp : dy) - fy) * tk; fz += ((sw ? vz / sp : dz) - fz) * tk;
    const fl = sqrt(fx * fx + fy * fy + fz * fz) || 1;
    EN[o] = x; EN[o + 1] = y; EN[o + 2] = z; EN[o + eVX] = vx; EN[o + eVY] = vy; EN[o + eVZ] = vz; EN[o + eDX] = fx / fl; EN[o + eDY] = fy / fl; EN[o + eDZ] = fz / fl;
    EN[o + ePH] += dt * (ty === 2 ? 2.5 + sp * 0.8 : ty === 0 ? 5 + sp * 1.5 : 3 + sp);
    EN[o + eFL] = max(0, EN[o + eFL] - dt * 5);
    if (EN[o + eSTK] > 3.5 || dist > 110) blink(o);
  }
  // keep them out of each other
  for (let i = 0; i < MAXE; i++) {
    const a = i * ES; if (EN[a + eST] !== 2) continue;
    for (let j = i + 1; j < MAXE; j++) {
      const b = j * ES; if (EN[b + eST] !== 2) continue;
      const dx = EN[b] - EN[a], dy = EN[b + 1] - EN[a + 1], dz = EN[b + 2] - EN[a + 2], rs = (T_R[EN[a + eTYPE]] + T_R[EN[b + eTYPE]]) * 0.9, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < rs * rs && d2 > 1e-4) { const d = sqrt(d2), m = (rs - d) / d * 0.5; EN[a] -= dx * m; EN[a + 1] -= dy * m; EN[a + 2] -= dz * m; EN[b] += dx * m; EN[b + 1] += dy * m; EN[b + 2] += dz * m; }
    }
  }
}

// ---------------------------------------------------------------- waves
function nextWave() {
  const w = ++wave; qN = qI = 0;
  const add = (t, n) => { while (n-- > 0 && qN < 96) QU[qN++] = t; };
  add(0, min(3 + w * 2, 16)); add(1, w > 1 ? min(1 + ((w - 1) * 0.8 | 0), 7) : 0); add(2, w > 2 ? min((w - 1) >> 1, 5) : 0); add(3, w > 3 ? min((w - 2) >> 1, 5) : 0);
  for (let i = qN - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0, t = QU[i]; QU[i] = QU[j]; QU[j] = t; }
  hpMul = 1 + max(0, w - 5) * 0.12; waveOn = true; spawnT = 1; riftN = 0;
  msg(`WAVE ${w}`, 2.5); sfx('alarm');
}
function tickWaves(dt) {
  if (!waveOn) { if ((waveT -= dt) <= 0) nextWave(); return; }
  spawnT -= dt;
  if (qI < qN && spawnT <= 0 && alive < min(MAXE, 6 + wave * 2)) {
    if (riftN <= 0) { // a new rift, near the core or near the diver
      const c = rnd() < 0.5;
      findSpot(c ? CORE[0] : F[CX], c ? coreY : F[CY], c ? CORE[2] : F[CZ], 22, 38); openRift(spX, spY, spZ);
      rfX = spX; rfY = spY; rfZ = spZ; riftN = 2 + (rnd() * 3 | 0); spawnT = 0.8;
    } else {
      spawn(QU[qI++], rfX + rr(-1, 1), rfY + rr(-1, 1), rfZ + rr(-1, 1)); riftN--;
      spawnT = riftN ? 0.5 : max(0.8, 3.5 - wave * 0.25) * rr(0.6, 1.2);
    }
  }
  if (qI >= qN && !alive) { // cleared: a breather, some repairs and a supply drop at the core
    waveOn = false; waveT = 10; score += wave * 100; coreHP = min(100, coreHP + 15);
    msg(`WAVE ${wave} CLEARED`, 3); sfx('pickup');
    for (let k = 0; k < 4; k++) drop(CORE[0] + cos(k * 1.57 + wave) * 3, coreY + 0.5, CORE[2] + sin(k * 1.57 + wave) * 3, k < 3 ? k : 3 + (wave & 1));
  }
}

// ---------------------------------------------------------------- pickups, particles, timers
function tickRest(dt) {
  for (let i = 0; i < MAXK; i++) {
    const o = i * KS; if (PK[o + 4] <= 0) continue;
    PK[o + 4] -= dt; PK[o + 5] += dt * 2;
    const dx = F[CX] - PK[o], dy = F[CY] - 0.3 - PK[o + 1], dz = F[CZ] - PK[o + 2], d = sqrt(dx * dx + dy * dy + dz * dz) || 1;
    if (pDead) continue;
    if (d < 4.5) { const k = 6 * dt / d; PK[o] += dx * k; PK[o + 1] += dy * k; PK[o + 2] += dz * k; } // drawn to the diver
    if (d < 1.2) {
      const ty = PK[o + 3];
      if (ty === 0) hp = min(100, hp + 25); else if (ty === 1) suit = min(100, suit + 30);
      else { const w = ty - 2; spare[w] = min(W_MAX[w], spare[w] + K_AMMO[w]); }
      PK[o + 4] = 0; fxPick = 1; sfx('pickup');
    }
  }
  for (let i = 0; i < MAXP; i++) {
    const o = i * PS; if (PT[o + 6] <= 0) continue;
    const c = PT[o + 9], k = exp(-dt * 2.5);
    PT[o + 6] -= dt; PT[o] += PT[o + 3] * dt; PT[o + 1] += PT[o + 4] * dt; PT[o + 2] += PT[o + 5] * dt;
    PT[o + 3] *= k; PT[o + 5] *= k; PT[o + 4] = PT[o + 4] * k + (c ? -0.15 : 2.2) * dt; // bubbles rise, the rest settles
  }
  for (let i = 0; i < MAXB; i++) if (BM[i * BS + 6] > 0) BM[i * BS + 6] -= dt;
  for (let i = 0; i < MAXR; i++) {
    const o = i * RS; if (RF[o + 3] >= RF[o + 4]) continue;
    RF[o + 3] += dt;
    if (rnd() < dt * 9) beam(RF[o], RF[o + 1], RF[o + 2], RF[o] + rr(-3, 3), RF[o + 1] + rr(-3, 3), RF[o + 2] + rr(-3, 3), 0.12, 0.05, 2); // lightning
  }
  fxHurt = max(0, fxHurt - dt * 1.2); fxPick = max(0, fxPick - dt * 4); coreFl = max(0, coreFl - dt * 3); coreMsgT -= dt; coreSndT -= dt;
  if (msgT > 0 && (msgT -= dt) <= 0) dMs.style.opacity = 0;
}

// ---------------------------------------------------------------- the frame
function reset() {
  EN.fill(0); PJ.fill(0); PK.fill(0); PT.fill(0); BM.fill(0); RF.fill(0);
  hp = 100; suit = 25; coreHP = 100; score = kills = wave = alive = 0; waveOn = false; waveT = 8; gOver = 0; pDead = false; hpMul = 1;
  mags.set(W_MAG); spare[0] = 156; spare[1] = 8; spare[2] = 12; wpn = 0;
  fireT = rldT = swapT = kick = heat = glow = fxHurt = fxPick = coreFl = coreMsgT = 0;
  lookAt(POSES[0][0], POSES[0][1], POSES[0][2], CORE[0], coreY, CORE[2]); F[VX] = F[VY] = F[VZ] = 0; vmYaw = F[YAW]; vmPit = F[PIT];
  msg('DEFEND THE RESONANCE CORE', 5);
}
function gameStart() { if (!gOn) { gOn = true; reset(); } }
function redeploy() { if (gOver > 1.5) reset(); }
function gameTick(dt) {
  if (!gOn) return;
  basis();
  if (gOver) gOver += dt; else { tickWeapons(dt); tickWaves(dt); }
  tickAliens(dt); tickShots(dt); tickRest(dt);
  // screen feedback (W_POST): damage, with a pulse when health is low; pickup blink; the colour drains at the end
  UB[60] = fxHurt + (hp < 30 && !gOver ? 0.12 + 0.08 * sin(F[TIME] * 5) : 0); UB[61] = fxPick; UB[62] = gOver ? min(0.8, gOver * 0.6) : 0;
  paint();
}
function spr(x, y, z, size, seed, r, g, b, kind) {
  if (nS + nB >= MAXFX) return;
  const o = nS++ * 12; FXD[o] = x; FXD[o + 1] = y; FXD[o + 2] = z; FXD[o + 3] = size; FXD[o + 4] = seed; FXD[o + 8] = r; FXD[o + 9] = g; FXD[o + 10] = b; FXD[o + 11] = kind;
}
function line(ax, ay, az, bx, by, bz, width, r, g, b, kind) {
  if (nS + nB >= MAXFX) return;
  const o = (MAXFX - ++nB) * 12; FXD[o] = ax; FXD[o + 1] = ay; FXD[o + 2] = az; FXD[o + 3] = 0; FXD[o + 4] = bx; FXD[o + 5] = by; FXD[o + 6] = bz; FXD[o + 7] = width; FXD[o + 8] = r; FXD[o + 9] = g; FXD[o + 10] = b; FXD[o + 11] = kind;
}
// this frame's instances: the weapon in hand, the core, the aliens, then every sprite and beam
function gamePrep() {
  basis();
  const t = F[TIME], dm = 1 - coreHP / 100;
  { // the weapon: lags a little behind the view, bobs with the swimming, kicks back, dips to reload or change
    const p = rldT > 0 ? 1 - rldT / W_RLD[wpn] : 0, dip = max(clamp(min(p, 1 - p) * 5, 0, 1), clamp(swapT / 0.35, 0, 1)), free = 1 - adsK * 0.8;
    const sp = min(sqrt(F[VX] * F[VX] + F[VY] * F[VY] + F[VZ] * F[VZ]), 9);
    const rg = 0.085 * (1 - adsK) + sin(bobT) * 0.002 * (1 + sp * 0.3) * free, dn = 0.085 - 0.032 * adsK + dip * 0.16 + sin(bobT * 2) * 0.0015 * (1 + sp * 0.3) * free, fw = 0.27 - kick * 0.03;
    GI[0] = F[CX] + bfx * fw + brx * rg - bux * dn; GI[1] = F[CY] + bfy * fw - buy * dn; GI[2] = F[CZ] + bfz * fw + brz * rg - buz * dn; GI[3] = 0.5;
    quat(GI, 4, F[YAW] - clamp(F[YAW] - vmYaw, -0.08, 0.08) * 0.6, F[PIT] - clamp(F[PIT] - vmPit, -0.08, 0.08) * 0.6 + kick * 0.05 - dip * 0.7);
    GI[8] = 4; GI[9] = 0; GI[10] = wpn === 2 ? glow : 0; GI[11] = 0;
  }
  GI[12] = CORE[0]; GI[13] = CORE[1]; GI[14] = CORE[2]; GI[15] = 1; GI[16] = GI[17] = GI[18] = 0; GI[19] = 1; GI[20] = 5; GI[21] = coreFl; GI[22] = dm; GI[23] = 0;
  nS = nB = 0;
  // the core's glow and its beacon to the surface: the way back when the fight has drifted off
  const cr = (0.1 + 0.9 * dm) * (coreHP > 0 ? 1 : 0.3), cg = (0.55 - 0.45 * dm) * (coreHP > 0 ? 1 : 0), cb = (0.7 - 0.65 * dm) * (coreHP > 0 ? 1 : 0);
  spr(CORE[0], coreY, CORE[2], 2.6 + 0.3 * sin(t * 3) + coreFl * 1.5, 0, cr * 0.7, cg * 0.7, cb * 0.7, 0);
  line(CORE[0], coreY + 0.6, CORE[2], CORE[0], -2, CORE[2], 0.16, cr * 0.4, cg * 0.4, cb * 0.4, 1);
  for (let i = 0; i < MAXE; i++) {
    const o = i * ES, st = EN[o + eST], g = (2 + i) * 12; if (!st) continue;
    const ty = EN[o + eTYPE], ch = ty === 3 && EN[o + eAT] > 0 ? 1 - EN[o + eAT] / 0.9 : 0;
    GI[g] = EN[o]; GI[g + 1] = EN[o + 1]; GI[g + 2] = EN[o + 2];
    GI[g + 3] = (0.9 + 0.25 * EN[o + eSEED]) * (st === 1 ? 1 - 0.85 * max(0, EN[o + eT]) / 0.7 : st === 3 ? 1 - 0.25 * EN[o + eT] : 1);
    quat(GI, g + 4, atan2(EN[o + eDX], -EN[o + eDZ]), Math.asin(clamp(EN[o + eDY], -1, 1)));
    GI[g + 8] = ty; GI[g + 9] = EN[o + ePH]; GI[g + 10] = max(EN[o + eFL], ch); GI[g + 11] = st === 3 ? 0.05 + EN[o + eT] * 0.75 : 0;
    if (ch > 0) spr(EN[o] + EN[o + eDX] * 0.7, EN[o + 1] - 0.35, EN[o + 2] + EN[o + eDZ] * 0.7, 0.3 + ch * 0.9, 0, 1, 0.45, 0.1, 0);
  }
  Q.writeBuffer(ibGI, 0, GI);
  for (let i = 0; i < MAXR; i++) {
    const o = i * RS, a = RF[o + 3] / RF[o + 4]; if (!(a < 1)) continue;
    const s = sqrt(sin(a * PI)) * 2.8;
    spr(RF[o], RF[o + 1], RF[o + 2], s, i * 0.37, 0.25, 0.9, 0.3, 1); spr(RF[o], RF[o + 1], RF[o + 2], s * 1.8, 0, 0.04, 0.2, 0.06, 0);
  }
  for (let i = 0; i < MAXK; i++) {
    const o = i * KS, l = PK[o + 4]; if (l <= 0) continue;
    const c = PK[o + 3] * 3, k = l < 6 ? 0.55 + 0.45 * sin(l * 9) : 1; // blinks before it is gone
    spr(PK[o], PK[o + 1] + sin(PK[o + 5]) * 0.12, PK[o + 2], 0.42, 0, K_COL[c] * k, K_COL[c + 1] * k, K_COL[c + 2] * k, 3);
  }
  for (let i = 0; i < MAXJ; i++) {
    const o = i * JS; if (PJ[o + 7] <= 0) continue;
    const ty = PJ[o + 6];
    if (ty === 2) line(PJ[o] - PJ[o + 3] * 0.02, PJ[o + 1] - PJ[o + 4] * 0.02, PJ[o + 2] - PJ[o + 5] * 0.02, PJ[o] + PJ[o + 3] * 0.012, PJ[o + 1] + PJ[o + 4] * 0.012, PJ[o + 2] + PJ[o + 5] * 0.012, 0.02, 0.5, 0.55, 0.6, 1);
    else if (ty) spr(PJ[o], PJ[o + 1], PJ[o + 2], 0.55 + 0.08 * sin(t * 30 + i), 0, 1, 0.42, 0.08, 3);
    else spr(PJ[o], PJ[o + 1], PJ[o + 2], 0.4, 0, 0.25, 1, 0.15, 3);
  }
  for (let i = 0; i < MAXP; i++) {
    const o = i * PS, l = PT[o + 6]; if (l <= 0) continue;
    const c = PT[o + 9], k = l / PT[o + 7], q = c * 3;
    spr(PT[o], PT[o + 1], PT[o + 2], c ? PT[o + 8] * (2.2 - 1.2 * k) : PT[o + 8], 0, P_COL[q] * k, P_COL[q + 1] * k, P_COL[q + 2] * k, c ? 0 : 2); // clouds spread as they fade
  }
  for (let i = 0; i < MAXB; i++) {
    const o = i * BS, l = BM[o + 6]; if (l <= 0) continue;
    const c = BM[o + 9], k = l / BM[o + 7], q = c * 3;
    line(BM[o], BM[o + 1], BM[o + 2], BM[o + 3], BM[o + 4], BM[o + 5], BM[o + 8], B_COL[q] * k, B_COL[q + 1] * k, B_COL[q + 2] * k, c ? 1 : 0);
  }
  if (flashT > 0 && wpn !== 1) { muzzle(); if (wpn) spr(mzX, mzY, mzZ, 0.3, 0, 0.4, 1.5, 1.8, 0); else spr(mzX, mzY, mzZ, 0.07, 0, 1.2, 0.9, 0.5, 0); }
  Q.writeBuffer(ibFX, 0, FXD, 0, nS * 12);
  if (nB) Q.writeBuffer(ibFX, (MAXFX - nB) * 48, FXD, (MAXFX - nB) * 12, nB * 12);
}
let gHide = false; // dev.js: draw none of the game's models, to measure what they cost
const drawS = (r, m, inst) => r.drawIndexed(m.n, 1, m.i0, m.v0, inst);
const drawT = (r, t, inst) => { r.setBindGroup(1, t.bg); r.setVertexBuffer(0, t.vb); r.setIndexBuffer(t.ib, 'uint32'); r.drawIndexed(t.n, 1, 0, 0, inst); };
// the core, the weapon in hand and the aliens: sculpted models, or where the assets were loaded (TX) the textured
// ones, the rifle held by sculpted hands. Dying aliens dissolve, in a pipeline of their own.
function gameDraw(r) {
  if (gHide) return;
  const held = gOn && !pDead;
  r.setPipeline(pGame); r.setVertexBuffer(0, vbG); r.setVertexBuffer(1, ibGI); r.setIndexBuffer(ibG, 'uint32');
  drawS(r, GM[7], 1);
  if (held) drawS(r, GM[TX && !wpn ? 8 : 4 + wpn], 0);
  if (!TX) {
    for (let i = 0; i < MAXE; i++) if (EN[i * ES + eST] && EN[i * ES + eST] < 3) drawS(r, GM[EN[i * ES + eTYPE]], 2 + i);
    r.setPipeline(pGameD);
    for (let i = 0; i < MAXE; i++) if (EN[i * ES + eST] === 3) drawS(r, GM[EN[i * ES + eTYPE]], 2 + i);
    return;
  }
  r.setPipeline(pTex);
  if (held && !wpn) { drawT(r, TX[4], 0); drawT(r, TX[5], 0); }
  for (let i = 0; i < MAXE; i++) if (EN[i * ES + eST] && EN[i * ES + eST] < 3) drawT(r, TX[EN[i * ES + eTYPE]], 2 + i);
  r.setPipeline(pTexD);
  for (let i = 0; i < MAXE; i++) if (EN[i * ES + eST] === 3) drawT(r, TX[EN[i * ES + eTYPE]], 2 + i);
}
function gameFx(r) {
  r.setVertexBuffer(0, ibFX);
  if (nB) { r.setPipeline(pFxB); r.draw(4, nB, 0, MAXFX - nB); }
  r.setPipeline(pFxP); r.draw(4, nS, 0, 0);
}
$('sw').onclick = () => pick((wpn + 1) % 3);
$('rl').onclick = reload;

// ---------------------------------------------------------------- start
// draw the first frame and wait for the GPU to finish it (pipelines get compiled on first use) before the reveal
lookAt(...POSES[0]);
await say('Letting the light in…', 1, 400);
render(); await Q.onSubmittedWorkDone();
setTimeout(keep, 15e3, 'abyssalLoad', ''); // the load counts as survived after 15 s of frames
ui(true);
requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });
