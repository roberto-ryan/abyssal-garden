// ============================================================================
// sculpted models: the aliens, the weapons with the diver's hands, the resonance core (load-time only)
// ============================================================================
// Each model is a signed distance function (metres, < 0 inside) built from blended ellipsoids, capsules and boxes,
// like the whale fluke in world.js. sculpt() turns it into a mesh and bakes what the shader (W_GAME) needs into each
// vertex: the normal, how much the vertex moves with the animation, ambient occlusion, and three material masks.
// Models are written facing +Z (right hand side of the diver is -X) and come out facing -Z like the camera.
const L3 = (x, y, z) => sqrt(x * x + y * y + z * z);
const sm = (a, b, k) => { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; }; // smooth union
const cut = (a, b, k) => -sm(-a, b, k); // a with b carved out
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ell = (x, y, z, rx, ry, rz) => { const k0 = L3(x / rx, y / ry, z / rz), k1 = L3(x / (rx * rx), y / (ry * ry), z / (rz * rz)); return k1 < 1e-6 ? -min(rx, ry, rz) : k0 * (k0 - 1) / k1; };
const cap = (x, y, z, ax, ay, az, bx, by, bz, ra, rb) => {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az, h = sat((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz));
  return L3(px - dx * h, py - dy * h, pz - dz * h) - (ra + (rb - ra) * h);
};
// a chain of capsules through the points P (flat x, y, z) with a radius R at each point
// (blended with k where the radii change a lot)
const limb = (x, y, z, P, R, k) => { let d = 1e9; for (let i = 0; i < R.length - 1; i++) { const o = i * 3, c = cap(x, y, z, P[o], P[o + 1], P[o + 2], P[o + 3], P[o + 4], P[o + 5], R[i], R[i + 1]); d = k ? sm(d, c, k) : min(d, c); } return d; };
const box = (x, y, z, hx, hy, hz, r) => { const qx = abs(x) - hx + r, qy = abs(y) - hy + r, qz = abs(z) - hz + r; return L3(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r; };
const cylZ = (x, y, z, r, hz) => { const d = sqrt(x * x + y * y) - r, e = abs(z) - hz; return min(max(d, e), 0) + sqrt(max(d, 0) ** 2 + max(e, 0) ** 2); };

// f: the distance function. mat(x, y, z, M) fills M = [animation weight, mask 1, glow, mask 3]; for the aliens mask 1
// is teeth and claws and mask 3 the soft underside, for the hard models (weapons, core) mask 1 is replaced by edge
// wear and mask 3 is 1 on gloves, .5 on plastic. Bounds x0..z1, cell size h.
function sculpt(f, mat, x0, y0, z0, x1, y1, z1, h, hard) {
  const nx = Math.ceil((x1 - x0) / h) + 2, ny = Math.ceil((y1 - y0) / h) + 2, nz = Math.ceil((z1 - z0) / h) + 2, D = new Float32Array(nx * ny * nz);
  // far from the surface a whole 4x4x4 block takes the value at its centre
  for (let bz = 0; bz < nz; bz += 4) for (let by = 0; by < ny; by += 4) for (let bx = 0; bx < nx; bx += 4) {
    const c = f(x0 + (bx + 1.5) * h, y0 + (by + 1.5) * h, z0 + (bz + 1.5) * h), skip = abs(c) > h * 6.5;
    for (let z = bz; z < min(bz + 4, nz); z++) for (let y = by; y < min(by + 4, ny); y++) for (let x = bx, i = bx + nx * (y + ny * z); x < min(bx + 4, nx); x++, i++) D[i] = skip ? -c : -f(x0 + x * h, y0 + y * h, z0 + z * h);
  }
  const sn = surfaceNets(D, nx, ny, nz), nv = sn.nv, vb = new ArrayBuffer(nv * 20), vf = new Float32Array(vb), v8 = new Int8Array(vb), u8 = new Uint8Array(vb), M = [0, 0, 0, 0], e = h * 0.7;
  for (let k = 0; k < nv; k++) {
    const x = x0 + sn.pos[k * 3] * h, y = y0 + sn.pos[k * 3 + 1] * h, z = z0 + sn.pos[k * 3 + 2] * h;
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e); const l = L3(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
    // occlusion: how much room there is along the normal, near and further out
    const ao = sat(0.5 * f(x + gx * h * 3, y + gy * h * 3, z + gz * h * 3) / (h * 3) + 0.5 * f(x + gx * h * 9, y + gy * h * 9, z + gz * h * 9) / (h * 9));
    M[0] = M[1] = M[2] = M[3] = 0; mat(x, y, z, M);
    // edge wear: on a convex edge the inside is closer than straight below the surface
    if (hard) M[1] = sat(1.6 * (1 + f(x - gx * h * 2.5, y - gy * h * 2.5, z - gz * h * 2.5) / (h * 2.5)));
    vf[k * 5] = -x; vf[k * 5 + 1] = y; vf[k * 5 + 2] = -z;
    const o = k * 20 + 12;
    v8[o] = round(-gx * 127); v8[o + 1] = round(gy * 127); v8[o + 2] = round(-gz * 127); v8[o + 3] = round(clamp(M[0], -1, 1) * 127);
    u8[o + 4] = round(ao * 255); u8[o + 5] = round(sat(M[1]) * 255); u8[o + 6] = round(sat(M[2]) * 255); u8[o + 7] = round(sat(M[3]) * 255);
  }
  return { vb, ib: new Uint32Array(sn.idx), nv };
}

// ---------------------------------------------------------------- leaper: a flat carapace on four clawed legs
const LP_F = [0.13, -0.03, 0.15, 0.27, 0.08, 0.3, 0.32, -0.08, 0.43, 0.28, -0.3, 0.48], LP_B = [0.14, -0.03, -0.08, 0.33, 0.07, -0.13, 0.43, -0.1, -0.19, 0.45, -0.32, -0.24], LP_R = [0.05, 0.04, 0.03, 0.01];
const lpFangs = (ax, y, z) => { let d = 1e9; for (let k = 0; k < 3; k++) { const a = 0.45 + k * 1.1, cx = sin(a) * 0.07, cz = 0.05 + cos(a) * 0.09; d = min(d, cap(ax, y, z, cx, -0.07, cz, cx * 0.4, -0.17, 0.05 + cos(a) * 0.04, 0.017, 0.003)); } return d; };
const fLeaper = (x, y, z) => {
  const ax = abs(x);
  let d = sm(ell(x, y, z, 0.2, 0.125, 0.26), ell(x, y - 0.035, z + 0.07, 0.165, 0.12, 0.17), 0.06);
  d -= 0.007 * cos(z * 42) * sat(y * 12 + 0.3); // folds across the back
  d = cut(d, ell(x, y + 0.13, z - 0.05, 0.1, 0.055, 0.13), 0.03); // the mouth underneath
  for (let k = 0; k < 4; k++) d = sm(d, cap(x, y, z, 0, 0.1, 0.1 - k * 0.09, 0, 0.19 - k * 0.012, 0.04 - k * 0.1, 0.022, 0.004), 0.02); // spines
  d = sm(d, limb(ax, y, z, LP_F, LP_R), 0.035); d = sm(d, limb(ax, y, z, LP_B, LP_R), 0.035);
  return min(d, lpFangs(ax, y, z), L3(ax - 0.075, y - 0.05, z - 0.222) - 0.024);
};
const mLeaper = (x, y, z, M) => {
  const ax = abs(x);
  M[0] = sat((ax - 0.17) / 0.28);
  M[1] = max(sat((-0.2 - y) * 14) * sat((ax - 0.2) * 20), sat(1 - lpFangs(ax, y, z) * 120));
  M[2] = sat(1.5 - (L3(ax - 0.075, y - 0.05, z - 0.222) - 0.024) * 150);
  M[3] = sat((-y - 0.02) * 10) * sat((0.2 - ax) * 12);
};

// ---------------------------------------------------------------- spitter: a squid-like body, arms around the mouth
const SP_ARMS = [1.5708, 0.31, -0.94].map((a) => { const P = []; for (let j = 0; j < 6; j++) { const r = 0.12 + 0.12 * sin(j / 5 * 2.8); P.push(cos(a) * r, sin(a) * r - 0.02, 0.56 + 0.14 * j); } return P; }), SP_R = [0.06, 0.052, 0.043, 0.033, 0.023, 0.01];
const fSpitter = (x, y, z) => {
  const ax = abs(x), ay = abs(y);
  let d = ell(x, y, z + 0.1, 0.3, 0.3, 0.62);
  d = sm(d, ell(x, y - 0.02, z - 0.38, 0.25, 0.23, 0.27), 0.1);
  d = sm(d, cap(x, y, z, 0, 0, -0.5, 0, 0, -1.1, 0.2, 0.05), 0.1);
  d = sm(d, ell(x, ay - 0.05, z + 1.18 + ay * 0.45, 0.028, 0.36, 0.17), 0.06); // tail fin
  d = sm(d, ell(x, y - 0.3, z + 0.2 + (y - 0.3) * 0.5, 0.03, 0.13, 0.36), 0.05); // crest
  d = sm(d, ell(ax - 0.38, y + 0.04 + (ax - 0.3) * 0.2, z + 0.2 + (ax - 0.3) * 0.6, 0.2, 0.025, 0.17), 0.06); // side fins
  d -= 0.009 * sin(x * 24) * sin(y * 24 + 1) * sin(z * 19) * sat((0.5 - z) * 4); // warts
  d = cut(d, L3(x, y + 0.02, z - 0.68) - 0.13, 0.04);
  for (const P of SP_ARMS) d = sm(d, limb(ax, y, z, P, SP_R), 0.04);
  return min(d, cap(x, y, z, 0, -0.02, 0.56, 0, -0.02, 0.7, 0.05, 0.006), L3(ax - 0.245, y - 0.1, z - 0.36) - 0.06);
};
const mSpitter = (x, y, z, M) => {
  const ax = abs(x);
  M[0] = z > 0.55 ? sat((z - 0.55) / 0.6) : sat((-z - 0.15) / 0.7) * 0.7;
  M[1] = max(sat((z - 1.12) * 12), sat(1 - cap(x, y, z, 0, -0.02, 0.56, 0, -0.02, 0.7, 0.05, 0.006) * 100));
  M[2] = sat(1.5 - (L3(ax - 0.245, y - 0.1, z - 0.36) - 0.06) * 100);
  M[3] = sat((-y - 0.05) * 6) * sat((0.5 - z) * 5);
};

// ---------------------------------------------------------------- stalker: four metres of fish-lizard, mostly jaw
const ST_P = [0, 0, 1.6, 0, 0, 1.0, 0, 0, 0.4, 0, 0, -0.3, 0, 0, -1.0, 0, 0, -1.6, 0, 0, -2.1, 0, 0, -2.55], ST_R = [0.24, 0.4, 0.5, 0.47, 0.35, 0.22, 0.12, 0.05];
const stTeeth = (ax, y, z) => {
  let d = 1e9; if (z < 1.3) return d;
  for (let i = 0; i < 8; i++) { const tz = 1.48 + i * 0.095, w = 0.2 - i * 0.019; d = min(d, cap(ax, y, z, w, -0.08, tz, w * 0.95, -0.2, tz + 0.01, 0.024, 0.004), cap(ax, y, z, w * 0.9, -0.2, tz + 0.047, w * 0.9, -0.09, tz + 0.05, 0.022, 0.004)); }
  return d;
};
const fStalker = (x, y, z) => {
  const ax = abs(x), ay = abs(y);
  let d = limb(x, y / 1.22, z, ST_P, ST_R, 0.3);
  d = sm(d, cap(x, y, z, 0, 0.03, 1.35, 0, -0.01, 2.3, 0.25, 0.06), 0.08); // upper jaw
  d = sm(d, cap(x, y, z, 0, -0.2, 1.15, 0, -0.26, 2.2, 0.17, 0.045), 0.05); // lower jaw
  d = cut(d, ell(x, y + 0.14, z - 1.9, 0.4, 0.04, 0.55), 0.03); // the gape
  d = sm(d, ell(ax - 0.19, y - 0.17, z - 1.38, 0.08, 0.05, 0.14), 0.05); // brow
  d = sm(d, ell(x, y - 0.72, z + 0.15 + (y - 0.5) * 0.7, 0.035, 0.4, 0.28), 0.1); // dorsal fin
  d = sm(d, ell(ax - 0.8, y + 0.3 + (ax - 0.4) * 0.3, z - 0.6 + (ax - 0.4) * 0.7, 0.5, 0.035, 0.2), 0.1); // front paddles
  d = sm(d, ell(ax - 0.36, y + 0.34 + (ax - 0.2) * 0.4, z + 1.25 + (ax - 0.2) * 0.6, 0.2, 0.028, 0.1), 0.06); // hind paddles
  d = sm(d, ell(x, ay - 0.4, z + 2.45 + ay * 0.55, 0.035, 0.45, 0.17), 0.1); // tail fluke
  d -= 0.018 * max(cos(z * 13), 0) * sat((y - 0.3) * 5) * sat((0.25 - ax) * 8); // plates along the back
  d += 0.014 * max(cos((z - 0.95) * 44), 0) * sat((ax - 0.2) * 10) * sat(1 - abs(y) * 4) * sat(1 - abs(z - 0.95) * 4); // gill slits
  return min(d, stTeeth(ax, y, z), L3(ax - 0.235, y - 0.1, z - 1.42) - 0.058);
};
const mStalker = (x, y, z, M) => {
  const ax = abs(x);
  M[0] = sat((1.2 - z) / 3.6);
  M[1] = sat(1 - stTeeth(ax, y, z) * 90);
  M[2] = sat(1.5 - (L3(ax - 0.235, y - 0.1, z - 1.42) - 0.058) * 100);
  M[3] = sat((-y - 0.08) * 5);
};

// ---------------------------------------------------------------- caster: a swollen brain over a withered body
const CA_B = [0, -0.02, 0, 0, -0.5, -0.05, 0, -0.95, -0.18, 0, -1.5, -0.45], CA_BR = [0.2, 0.17, 0.1, 0.025], CA_A = [0.22, -0.2, 0.02, 0.52, -0.47, 0.22, 0.42, -0.36, 0.6], CA_AR = [0.055, 0.045, 0.033];
const caClaws = (ax, y, z) => min(cap(ax, y, z, 0.42, -0.36, 0.6, 0.52, -0.29, 0.75, 0.022, 0.005), cap(ax, y, z, 0.42, -0.36, 0.6, 0.42, -0.46, 0.76, 0.022, 0.005), cap(ax, y, z, 0.42, -0.36, 0.6, 0.33, -0.29, 0.75, 0.022, 0.005));
const caGlow = (x, ax, y, z) => min(L3(ax - 0.17, y - 0.3, z - 0.4) - 0.06, L3(x, y - 0.17, z - 0.47) - 0.04, L3(ax - 0.42, y + 0.37, z - 0.71) - 0.055);
const fCaster = (x, y, z) => {
  const ax = abs(x);
  let d = ell(x, y - 0.36, z + 0.03, 0.4, 0.44, 0.5);
  d += 0.035 * exp(-x * x * 900) * sat((y - 0.4) * 6); // the cleft between the lobes
  d -= 0.012 * sin(x * 34 + 3 * sin(z * 15)) * sat((y - 0.35) * 5); // folds
  d = sm(d, ell(x, y - 0.1, z - 0.3, 0.19, 0.2, 0.2), 0.08); // face
  d = cut(d, ell(x, y - 0.01, z - 0.5, 0.09, 0.02, 0.06), 0.02);
  let b = sm(limb(x, y, z, CA_B, CA_BR, 0.1), ell(x, y + 0.3, z - 0.04, 0.25, 0.2, 0.17), 0.08);
  b -= 0.012 * cos(y * 38) * sat((-y - 0.1) * 5) * sat((y + 1.2) * 5); // ribs
  d = sm(d, b, 0.1);
  d = sm(d, limb(ax, y, z, CA_A, CA_AR), 0.05);
  d = sm(d, cap(ax, y, z, 0.1, -0.85, -0.12, 0.17, -1.2, -0.02, 0.045, 0.012), 0.04); // what is left of its legs
  return min(d, caClaws(ax, y, z), caGlow(x, ax, y, z));
};
const mCaster = (x, y, z, M) => {
  const ax = abs(x);
  M[0] = ax > 0.3 ? 0.25 : sat((-y - 0.2) / 1.3);
  M[2] = sat(1.5 - caGlow(x, ax, y, z) * 100);
  M[1] = sat(1 - caClaws(ax, y, z) * 100) * sat((z - 0.63) * 30) * (1 - M[2]);
  M[3] = sat((y - 0.38) * 5);
};

// ---------------------------------------------------------------- the diver's gloved hand: a fist at g, the forearm towards e
const hand = (x, y, z, gx, gy, gz, ex, ey, ez) => {
  let d = sm(ell(x - gx, y - gy, z - gz, 0.034, 0.046, 0.04), cap(x, y, z, gx, gy - 0.01, gz - 0.01, ex, ey, ez, 0.034, 0.052), 0.02);
  for (let i = 0; i < 4; i++) { const fy = gy + 0.035 - i * 0.022; d = sm(d, cap(x, y, z, gx - 0.03, fy, gz + 0.024, gx + 0.03, fy, gz + 0.032, 0.011, 0.011), 0.006); }
  d = sm(d, cap(x, y, z, gx + 0.028, gy + 0.03, gz - 0.012, gx + 0.012, gy + 0.052, gz + 0.03, 0.013, 0.011), 0.008); // thumb
  const t = sat(((x - gx) * (ex - gx) + (y - gy) * (ey - gy) + (z - gz) * (ez - gz)) / ((ex - gx) ** 2 + (ey - gy) ** 2 + (ez - gz) ** 2));
  return d - 0.005 * sat(1 - abs(t - 0.3) * 14); // the cuff of the glove
};
// weapon material: gloves 1, plastic .5 where `poly` says so, light where `glow` does
const mGun = (gun, hands, poly, glow) => (x, y, z, M) => { M[3] = hands(x, y, z) < gun(x, y, z) ? 1 : poly(x, y, z) ? 0.5 : 0; M[2] = glow ? sat(1.5 - glow(x, y, z) * 400) : 0; };
const GRIP = (x, y, z) => box(x, y + 0.078, z + 0.055 - (y + 0.03) * 0.35, 0.014, 0.05, 0.02, 0.008);

// ---------------------------------------------------------------- dart rifle
const rifleGun = (x, y, z) => {
  let d = sm(box(x, y, z - 0.03, 0.02, 0.03, 0.14, 0.006), cap(x, y, z, 0, 0.03, -0.1, 0, 0.03, 0.17, 0.017, 0.017), 0.006);
  const zz = z - 0.19 - 0.03 * clamp(round((z - 0.19) / 0.03), 0, 4);
  d = min(d, max(box(x, y + 0.002, z - 0.255, 0.02, 0.025, 0.085, 0.009), -box(x, y - 0.004, zz, 0.05, 0.005, 0.009, 0.003))); // slotted handguard
  d = min(d, cylZ(x, y, z - 0.43, 0.01, 0.1), cylZ(x, y, z - 0.505, 0.014, 0.022)); // barrel, muzzle
  d = min(d, box(x, y, z - 0.385, 0.013, 0.013, 0.008, 0.003), box(x, y - 0.03, z - 0.385, 0.004, 0.02, 0.006, 0.002)); // front sight
  d = min(d, max(box(x, y - 0.053, z + 0.05, 0.011, 0.008, 0.012, 0.002), -box(x, y - 0.059, z + 0.05, 0.003, 0.006, 0.02, 0.001))); // rear sight
  d = min(d, box(x, y + 0.1, z - 0.09 - (y + 0.03) * 0.25, 0.012, 0.07, 0.042, 0.006) - 0.0015 * cos(y * 110)); // the deep magazine for its long darts
  d = min(d, GRIP(x, y, z), box(x + 0.024, y - 0.012, z - 0.06, 0.006, 0.004, 0.012, 0.002));
  d = min(d, cap(x, y, z, 0, 0.012, -0.11, 0, -0.002, -0.36, 0.008, 0.008), cap(x, y, z, 0, -0.03, -0.11, 0, -0.06, -0.36, 0.008, 0.008)); // wire stock
  return min(d, box(x, y + 0.03, z + 0.365, 0.012, 0.045, 0.007, 0.004));
};
const rifleHands = (x, y, z) => min(hand(x, y, z, 0, -0.075, -0.05, -0.07, -0.22, -0.36), hand(-x, y, z + 0.0, 0, -0.045, 0.26, -0.26, -0.24, -0.02));
const fRifle = (x, y, z) => min(rifleGun(x, y, z), rifleHands(x, y, z));

// ---------------------------------------------------------------- harpoon gun
const harpGun = (x, y, z) => {
  const ax = abs(x);
  let d = min(cylZ(x, y, z - 0.22, 0.014, 0.28), box(x, y, z - 0.5, 0.02, 0.017, 0.02, 0.005), box(x, y - 0.002, z + 0.11, 0.018, 0.022, 0.07, 0.007));
  d = min(d, cylZ(x, y, z - 0.6, 0.007, 0.17), cap(x, y, z, 0, 0, 0.745, 0, 0, 0.82, 0.015, 0.001), cap(x, y, z, 0, 0.004, 0.75, 0, 0.022, 0.71, 0.004, 0.003)); // the spear, its head and barb
  d = min(d, cap(ax, y, z, 0.024, 0, 0.49, 0.013, 0.014, 0.1, 0.006, 0.006), cap(ax, y, z, 0.013, 0.014, 0.1, 0, 0.022, -0.02, 0.006, 0.006)); // the rubber bands
  d = min(d, cylZ(y + 0.045, z - 0.2, x, 0.03, 0.011), cylZ(y + 0.045, z - 0.2, x, 0.012, 0.016), box(x, y + 0.02, z - 0.2, 0.007, 0.02, 0.014, 0.003)); // line reel
  return min(d, GRIP(x, y, z));
};
const harpHands = (x, y, z) => hand(x, y, z, 0, -0.075, -0.05, -0.07, -0.22, -0.36);
const fHarpoon = (x, y, z) => min(harpGun(x, y, z), harpHands(x, y, z));

// ---------------------------------------------------------------- arc lance
const lanceGlow = (x, y, z) => min(cylZ(x, y, z - 0.29, 0.006, 0.16), L3(x, y, z - 0.46) - 0.012, L3(x, y - 0.04, z + 0.04) - 0.008);
const lanceGun = (x, y, z) => {
  const ax = abs(x), r = sqrt(x * x + y * y);
  let d = min(box(x, y, z, 0.03, 0.035, 0.13, 0.01), cylZ(ax - 0.02, y - 0.03, z + 0.09, 0.017, 0.07)); // body, cells
  d = min(d, cap(x, y, z, 0, 0.032, 0.12, 0, 0.015, 0.46, 0.008, 0.006), cap(ax, y, z, 0.028, -0.016, 0.12, 0.013, -0.0075, 0.46, 0.008, 0.006)); // three rails
  for (let k = 0; k < 3; k++) d = min(d, L3(r - 0.027 + k * 0.004, z - 0.2 - k * 0.08, 0) - 0.007); // coils
  return min(d, GRIP(x, y, z), lanceGlow(x, y, z));
};
const lanceHands = (x, y, z) => min(hand(x, y, z, 0, -0.075, -0.05, -0.07, -0.22, -0.36), hand(-x, y, z, 0, -0.065, 0.07, -0.26, -0.25, -0.1));
const fLance = (x, y, z) => min(lanceGun(x, y, z), lanceHands(x, y, z));

// ---------------------------------------------------------------- the resonance core: pedestal, three prongs, the crystal between them
const CO_P = [0, 1, 2].map((k) => { const c = cos(k * 2.0944), s = sin(k * 2.0944); return [c * 0.9, 0.15, s * 0.9, c * 1.18, 1.2, s * 1.18, c * 0.98, 2.2, s * 0.98, c * 0.62, 2.78, s * 0.62]; }), CO_R = [0.11, 0.09, 0.07, 0.045];
const coGem = (x, y, z) => (sqrt(x * x + z * z) + abs(y - 1.95) * 0.62 - 0.33) * 0.85;
const fCore = (x, y, z) => {
  const r = sqrt(x * x + z * z), qx = r - 1.0, qy = abs(y - 0.12) - 0.06;
  let d = min(max(qx, qy), 0) + sqrt(max(qx, 0) ** 2 + max(qy, 0) ** 2) - 0.06; // base plate
  d = sm(d, cap(x, y, z, 0, 0.2, 0, 0, 1.0, 0, 0.42, 0.25), 0.15);
  d = sm(d, L3(r - 0.33, y - 1.03, 0) - 0.09, 0.04); // collar
  d -= 0.012 * max(cos(y * 26), 0) * sat((y - 0.3) * 6) * sat((0.9 - y) * 6); // cooling fins
  for (const P of CO_P) d = sm(d, limb(x, y, z, P, CO_R), 0.08);
  return min(d, coGem(x, y, z));
};
const mCore = (x, y, z, M) => { M[2] = sat(1.5 - coGem(x, y, z) * 60); };

// the hands alone, placed for the textured rifle of ../assets (its grip is at the origin, the fore-end 35 cm ahead)
const rifle2Hands = (x, y, z) => min(hand(x, y, z, 0, -0.035, -0.01, -0.07, -0.2, -0.33), hand(-x, y, z, 0, -0.05, 0.34, -0.26, -0.25, 0.06));
const makeRifleHands = () => sculpt(rifle2Hands, (x, y, z, M) => { M[3] = 1; }, -0.13, -0.31, -0.4, 0.33, 0.06, 0.42, 0.004 * (1 + LV * 0.2), 1);
// q: cell size factor (quality.js: coarser on Medium and Low; the weapons, always close up, lose less)
const makeModels = (q = 1 + LV * 0.3, w = 0.004 * (1 + LV * 0.2)) => [
  sculpt(fLeaper, mLeaper, -0.52, -0.38, -0.33, 0.52, 0.24, 0.54, 0.014 * q),
  sculpt(fSpitter, mSpitter, -0.64, -0.5, -1.5, 0.64, 0.5, 1.36, 0.02 * q),
  sculpt(fStalker, mStalker, -1.42, -1.0, -3.15, 1.42, 1.25, 2.45, 0.026 * q),
  sculpt(fCaster, mCaster, -0.66, -1.6, -0.6, 0.66, 0.86, 0.86, 0.019 * q),
  sculpt(fRifle, mGun(rifleGun, rifleHands, (x, y, z) => z > 0.17 && z < 0.345 && y > -0.03 || GRIP(x, y, z) < 0.002), -0.13, -0.3, -0.43, 0.33, 0.08, 0.54, w, 1),
  sculpt(fHarpoon, mGun(harpGun, harpHands, (x, y, z) => GRIP(x, y, z) < 0.002 || abs(y - 0.01) < 0.014 && abs(x) > 0.009 && z < 0.49 && z > -0.03 || y < -0.03 && z > 0.15), -0.13, -0.3, -0.43, 0.07, 0.06, 0.83, w, 1),
  sculpt(fLance, mGun(lanceGun, lanceHands, (x, y, z) => GRIP(x, y, z) < 0.002 || z > 0.17 && z < 0.4 && abs(sqrt(x * x + y * y) - 0.024) < 0.011, lanceGlow), -0.13, -0.31, -0.43, 0.33, 0.08, 0.49, w, 1),
  sculpt(fCore, mCore, -1.35, -0.05, -1.35, 1.35, 2.95, 1.35, 0.035 * q, 1),
];
