// Downloads the scanned / modelled assets and converts them into what the game loads from ../assets:
//   npm run assets
// Sources (all CC0, see ../assets/CREDITS.md): Smithsonian Open Access 3D scans for the aliens, a Poly Haven model
// for the rifle. Each becomes <name>.bin (u32 vertex count, u32 index count, vertices of 20 bytes: position f32 x 3,
// normal snorm8 x 3 + animation weight snorm8, uv unorm16 x 2, then u32 indices) and the textures <name>_c.jpg
// (colour), <name>_n.jpg (normal map), <name>_o.jpg (occlusion, or occlusion / roughness / metal), copied as they are.
// The mesh is turned to face -Z with +Y up, scaled to metres at the size the game wants, and thinned out.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { MeshoptSimplifier } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, '..', 'assets'), cache = path.join(here, '.cache');
mkdirSync(out, { recursive: true }); mkdirSync(cache, { recursive: true });
const draco3d = createRequire(import.meta.url)('draco3d');
const SI = 'https://3d-api.si.edu/content/document/3d_package:', PH = 'https://dl.polyhaven.org/file/ph-assets/Models/';
const { sin, cos, min, max, abs, hypot } = Math, clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// rot: rows of the matrix taking source axes to game axes (x right, y up, z back); level: then lay the flattest
// direction of the scan along Y (a crab scanned on a slope); then `yaw` about Y (radians).
// size: extent in metres along `axis` (0 x, 1 y, 2 z) after turning. origin: where the game's origin sits in the
// turned bounding box (0..1 per axis). tris: triangle budget. w(x, y, z): animation weight in game space.
const ASSETS = [
  { name: 'leaper', url: SI + '22d816a4-aaf6-4b3d-9ea6-283c41daa987/Limulus_polyphemus-150k-1024-low.glb',
    rot: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], level: 1, yaw: -0.42, size: 0.9, axis: 2, origin: [0.5, 0.5, 0.32], tris: 26000, w: (x, y, z) => clamp((z - 0.12) / 0.5, 0, 1) },
  { name: 'spitter', url: SI + 'e0bdb234-d604-41fd-8f47-27368159c476/USNM_195928-150k-1024-low.glb',
    rot: [[0, 1, 0], [0, 0, -1], [1, 0, 0]], yaw: 0, size: 1.8, axis: 2, origin: [0.5, 0.5, 0.45], tris: 44000, w: (x, y, z) => clamp((z - 0.1) / 0.9, 0, 1) },
  { name: 'stalker', url: SI + 'd829e005-792e-460f-923f-dbd5e9ede1cb/Grapsus_planifrons-150k-1024-low.glb',
    rot: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], level: 1, yaw: 2.61, size: 2.6, axis: 0, origin: [0.5, 0.5, 0.5], tris: 60000, w: (x, y, z) => clamp((hypot(x, z) - 0.57) / 0.76, 0, 1) },
  { name: 'caster', url: SI + '0c69e749-b8df-4e5a-8d20-c38aebaf6279/Pycnopodia_helianthoides-150k-1024-low.glb',
    rot: [[1, 0, 0], [0, -1, 0], [0, 0, -1]], yaw: 0, size: 1.7, axis: 0, origin: [0.5, 0.75, 0.5], tris: 50000, w: (x, y, z) => clamp((0.1 - y) / 0.8, 0, 1) },
  { name: 'rifle', gltf: PH + 'gltf/1k/bolt_action_rifle_7_62/bolt_action_rifle_7_62_1k.gltf', bin: PH + 'gltf/8k/bolt_action_rifle_7_62/bolt_action_rifle_7_62.bin', tex: PH + 'jpg/1k/bolt_action_rifle_7_62/',
    rot: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], yaw: 0, size: 1.1, axis: 2, origin: [0.5, 0.39, 0.71], tris: 0, w: () => 0 }, // origin: the grip
];

async function get(url) {
  const f = path.join(cache, url.replace(/[^\w.-]+/g, '_').slice(-150));
  if (!existsSync(f)) { const r = await fetch(url); if (!r.ok) throw new Error(url + ': ' + r.status); writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
  return readFileSync(f);
}
let dm;
// a Draco-compressed GLB with one mesh and one material (the Smithsonian's)
async function readGlb(b) {
  dm ||= await draco3d.createDecoderModule({});
  const jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
  const view = (i) => { const v = j.bufferViews[i]; return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };
  const p = j.meshes[0].primitives[0], dx = p.extensions.KHR_draco_mesh_compression, data = view(dx.bufferView);
  const dec = new dm.Decoder(), db = new dm.DecoderBuffer(); db.Init(new Int8Array(data.buffer, data.byteOffset, data.byteLength), data.byteLength);
  const mesh = new dm.Mesh(), st = dec.DecodeBufferToMesh(db, mesh); if (!st.ok()) throw new Error('draco: ' + st.error_msg());
  const attr = (name, n) => { const arr = new dm.DracoFloat32Array(); dec.GetAttributeFloatForAllPoints(mesh, dec.GetAttributeByUniqueId(mesh, dx.attributes[name]), arr); const o = new Float32Array(mesh.num_points() * n); for (let i = 0; i < o.length; i++) o[i] = arr.GetValue(i); dm.destroy(arr); return o; };
  const pos = attr('POSITION', 3), nrm = attr('NORMAL', 3), uv = attr('TEXCOORD_0', 2), nf = mesh.num_faces(), idx = new Uint32Array(nf * 3), ia = new dm.DracoInt32Array();
  for (let f = 0; f < nf; f++) { dec.GetFaceFromMesh(mesh, f, ia); idx[f * 3] = ia.GetValue(0); idx[f * 3 + 1] = ia.GetValue(1); idx[f * 3 + 2] = ia.GetValue(2); }
  const m = j.materials[0], img = (t) => Buffer.from(view(j.images[j.textures[t.index].source].bufferView));
  return [{ pos, nrm, uv, idx, color: img(m.pbrMetallicRoughness.baseColorTexture), normal: img(m.normalTexture), orm: img(m.occlusionTexture) }];
}
// a plain .gltf with a separate .bin and texture files (Poly Haven's): one part per material, nodes flattened
async function readGltf(a) {
  const j = JSON.parse((await get(a.gltf)).toString()), bin = await get(a.bin), parts = new Map();
  const acc = (i) => {
    const c = j.accessors[i], v = j.bufferViews[c.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[c.type], o = (v.byteOffset || 0) + (c.byteOffset || 0), st = v.byteStride || 0, r = new Float64Array(c.count * n);
    const rd = { 5126: [4, (p) => bin.readFloatLE(p)], 5125: [4, (p) => bin.readUInt32LE(p)], 5123: [2, (p) => bin.readUInt16LE(p)], 5121: [1, (p) => bin.readUInt8(p)] }[c.componentType];
    for (let k = 0; k < c.count; k++) for (let q = 0; q < n; q++) r[k * n + q] = rd[1](o + k * (st || rd[0] * n) + q * rd[0]);
    return r;
  };
  const mul = (A, B) => { const C = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) C[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return C; };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const walk = (ni, M) => {
    const n = j.nodes[ni], W = mul(M, local(n));
    if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
      const P = acc(p.attributes.POSITION), N = acc(p.attributes.NORMAL), U = acc(p.attributes.TEXCOORD_0), I = acc(p.indices);
      // materials that share their textures (the rifle's glass) go into one part
      const key = j.textures[j.materials[p.material].pbrMetallicRoughness.baseColorTexture.index].source;
      let g = parts.get(key); if (!g) parts.set(key, g = { pos: [], nrm: [], uv: [], idx: [], mi: p.material });
      const base = g.pos.length / 3;
      for (let k = 0; k < P.length; k += 3) {
        const x = P[k], y = P[k + 1], z = P[k + 2], a = N[k], b = N[k + 1], c = N[k + 2];
        g.pos.push(W[0] * x + W[4] * y + W[8] * z + W[12], W[1] * x + W[5] * y + W[9] * z + W[13], W[2] * x + W[6] * y + W[10] * z + W[14]);
        g.nrm.push(W[0] * a + W[4] * b + W[8] * c, W[1] * a + W[5] * b + W[9] * c, W[2] * a + W[6] * b + W[10] * c);
      }
      for (const u of U) g.uv.push(u); for (const i of I) g.idx.push(base + i);
    }
    for (const c of n.children || []) walk(c, W);
  };
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const res = [];
  for (const g of parts.values()) {
    const m = j.materials[g.mi], file = async (t) => get(a.tex + path.basename(j.images[j.textures[t.index].source].uri));
    res.push({ pos: new Float32Array(g.pos), nrm: new Float32Array(g.nrm), uv: new Float32Array(g.uv), idx: new Uint32Array(g.idx), mat: m.name,
      color: await file(m.pbrMetallicRoughness.baseColorTexture), normal: await file(m.normalTexture), orm: await file(m.pbrMetallicRoughness.metallicRoughnessTexture) });
  }
  return res;
}

await MeshoptSimplifier.ready;
const only = process.argv[2];
for (const a of ASSETS) {
  if (only && a.name !== only) continue;
  const parts = (a.gltf ? await readGltf(a) : await readGlb(await get(a.url))).filter((g) => g.idx.length > 600); // not the rifle's scope glass
  // turn, then measure all parts together
  const cy = cos(a.yaw), sy = sin(a.yaw), R = a.rot, turn = (v, o) => { const x = R[0][0] * v[o] + R[0][1] * v[o + 1] + R[0][2] * v[o + 2], y = R[1][0] * v[o] + R[1][1] * v[o + 1] + R[1][2] * v[o + 2], z = R[2][0] * v[o] + R[2][1] * v[o + 1] + R[2][2] * v[o + 2]; v[o] = x; v[o + 1] = y; v[o + 2] = z; if (lv) lv(v, o); const X = v[o], Z = v[o + 2]; v[o] = X * cy + Z * sy; v[o + 2] = -X * sy + Z * cy; };
  let lv = null;
  if (a.level) { // the direction in which the points spread least, from the covariance matrix, becomes +Y
    const g = parts[0], n = g.pos.length / 3, m = [0, 0, 0], C = [0, 0, 0, 0, 0, 0, 0, 0, 0], T = (v) => { const o = [0, 0, 0]; for (let r = 0; r < 3; r++) o[r] = R[r][0] * v[0] + R[r][1] * v[1] + R[r][2] * v[2]; return o; };
    for (let k = 0; k < n; k++) for (let q = 0; q < 3; q++) m[q] += g.pos[k * 3 + q] / n;
    for (let k = 0; k < n; k++) { const d = T([g.pos[k * 3] - m[0], g.pos[k * 3 + 1] - m[1], g.pos[k * 3 + 2] - m[2]]); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] += d[r] * d[c]; }
    const top = (ex) => { let v = [0.3, 0.5, 0.8]; for (let it = 0; it < 200; it++) { let w = [0, 1, 2].map((r) => C[r * 3] * v[0] + C[r * 3 + 1] * v[1] + C[r * 3 + 2] * v[2]); if (ex) { const d = w[0] * ex[0] + w[1] * ex[1] + w[2] * ex[2]; w = w.map((x, q) => x - ex[q] * d); } const l = hypot(...w); v = w.map((x) => x / l); } return v; };
    const e1 = top(), e2 = top(e1); let u = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; if (u[1] < 0) u = u.map((x) => -x);
    // rotation about the axis u x Y that takes u to Y
    const ax = [-u[2], 0, u[0]], al = hypot(...ax) || 1, kx = ax[0] / al, kz = ax[2] / al, c = u[1], sn = al;
    lv = (v, o) => { const x = v[o], y = v[o + 1], z = v[o + 2], d = kx * x + kz * z, cx = -kz * y, cyy = kz * x - kx * z, cz = kx * y; v[o] = x * c + cx * sn + kx * d * (1 - c); v[o + 1] = y * c + cyy * sn; v[o + 2] = z * c + cz * sn + kz * d * (1 - c); };
  }
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const g of parts) for (let k = 0; k < g.pos.length; k += 3) { turn(g.pos, k); turn(g.nrm, k); for (let q = 0; q < 3; q++) { lo[q] = min(lo[q], g.pos[k + q]); hi[q] = max(hi[q], g.pos[k + q]); } }
  const s = a.size / (hi[a.axis] - lo[a.axis]), org = a.origin.map((t, q) => lo[q] + (hi[q] - lo[q]) * t);
  parts.forEach((g, pi) => {
    for (let k = 0; k < g.pos.length; k += 3) for (let q = 0; q < 3; q++) g.pos[k + q] = (g.pos[k + q] - org[q]) * s;
    let idx = g.idx;
    if (a.tris && idx.length > a.tris * 3) idx = MeshoptSimplifier.simplify(idx, g.pos, 3, a.tris * 3, 0.05)[0];
    // keep only the vertices still in use
    const map = new Int32Array(g.pos.length / 3).fill(-1); let nv = 0; for (const i of idx) if (map[i] < 0) map[i] = nv++;
    const buf = Buffer.alloc(8 + nv * 20 + idx.length * 4); buf.writeUInt32LE(nv, 0); buf.writeUInt32LE(idx.length, 4);
    map.forEach((n, i) => {
      if (n < 0) return;
      const o = 8 + n * 20, x = g.pos[i * 3], y = g.pos[i * 3 + 1], z = g.pos[i * 3 + 2], l = hypot(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]) || 1;
      buf.writeFloatLE(x, o); buf.writeFloatLE(y, o + 4); buf.writeFloatLE(z, o + 8);
      for (let q = 0; q < 3; q++) buf.writeInt8(Math.round(g.nrm[i * 3 + q] / l * 127), o + 12 + q);
      buf.writeInt8(Math.round(clamp(a.w(x, y, z), 0, 1) * 127), o + 15);
      const u = g.uv[i * 2], v = g.uv[i * 2 + 1];
      buf.writeUInt16LE(Math.round(clamp(u - Math.floor(u), 0, 1) * 65535), o + 16); buf.writeUInt16LE(Math.round(clamp(v - Math.floor(v), 0, 1) * 65535), o + 18);
    });
    idx.forEach((i, k) => buf.writeUInt32LE(map[i], 8 + nv * 20 + k * 4));
    const name = a.name + (pi ? pi + 1 : '');
    writeFileSync(path.join(out, name + '.bin'), buf);
    writeFileSync(path.join(out, name + '_c.jpg'), g.color); writeFileSync(path.join(out, name + '_n.jpg'), g.normal); writeFileSync(path.join(out, name + '_o.jpg'), g.orm);
    console.log(`${name}: ${nv} vertices, ${idx.length / 3} triangles, ${(buf.length / 1024).toFixed(0)} kB + textures ${((g.color.length + g.normal.length + g.orm.length) / 1024).toFixed(0)} kB${g.mat ? ' (' + g.mat + ')' : ''}; size ${hi.map((h, q) => ((h - lo[q]) * s).toFixed(2)).join(' x ')} m`);
  });
}
