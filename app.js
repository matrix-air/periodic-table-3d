import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { ELEMENTS, CATS } from './data/elements.js';

/* ---------------- 基础场景 ---------------- */
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b16);
scene.fog = new THREE.Fog(0x070b16, 55, 130);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true; // 默认缓转，勾选框可暂停
controls.autoRotateSpeed = 0.9;

scene.add(new THREE.HemisphereLight(0x9db4ff, 0x141824, 0.85));
const dir = new THREE.DirectionalLight(0xffffff, 1.25);
dir.position.set(8, 16, 10);
scene.add(dir);
const dir2 = new THREE.DirectionalLight(0x88aaff, 0.35);
dir2.position.set(-10, 6, -12);
scene.add(dir2);

// 背景星点
{
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 70 + Math.random() * 60, t = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x33406e, size: 0.14, sizeAttenuation: true })));
}

/* ---------------- 属性与工具 ---------------- */
const PROPS = {
  flat: { label: '平整' },
  rad:  { label: '原子半径（共价,pm）', unit: 'pm', get: e => e.rad },
  eneg: { label: '电负性（泡令）', unit: '', get: e => e.eneg },
  ie1:  { label: '第一电离能（kJ/mol）', unit: 'kJ/mol', get: e => e.ie1 },
  mass: { label: '相对原子质量', unit: '', get: e => e.mass },
};
const RANGE = {};
for (const [k, p] of Object.entries(PROPS)) {
  if (!p.get) continue;
  const vs = ELEMENTS.map(p.get).filter(v => v != null);
  RANGE[k] = { min: Math.min(...vs), max: Math.max(...vs) };
}
const heightOf = e => {
  const p = PROPS[state.prop];
  if (!p.get) return 0.16;
  const v = p.get(e);
  if (v == null) return 0.16;
  const { min, max } = RANGE[state.prop];
  return 0.16 + 2.15 * (v - min) / (max - min);
};

function catColor(el) { return CATS[el.cat].color; }

/* 顶面文字纹理（缓存） */
const texCache = new Map();
function labelTexture(el, isPh) {
  const key = (isPh ? el.key + '|' : el.z) + '';
  if (texCache.has(key)) return texCache.get(key);
  const S = 320, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const col = new THREE.Color(catColor(el));
  const lum = 0.299 * col.r + 0.587 * col.g + 0.114 * col.b;
  const dark = lum > 0.55;
  // 底色：轻微纵向渐变
  const grad = c.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, `#${col.clone().multiplyScalar(1.18).getHexString()}`);
  grad.addColorStop(1, `#${col.clone().multiplyScalar(0.82).getHexString()}`);
  c.fillStyle = grad;
  c.fillRect(0, 0, S, S);
  c.textAlign = 'center';
  c.fillStyle = dark ? 'rgba(14,17,32,0.95)' : 'rgba(255,255,255,0.96)';
  if (isPh) {
    c.font = '700 60px -apple-system, "PingFang SC", sans-serif';
    c.fillText(el.phCn, S / 2, S / 2 - 10);
    c.font = '600 52px -apple-system, sans-serif';
    c.fillText(el.phRange, S / 2, S / 2 + 58);
  } else {
    c.textAlign = 'left';
    c.font = '700 50px -apple-system, sans-serif';
    c.fillText(String(el.z), 22, 58);
    c.textAlign = 'center';
    c.font = '800 128px -apple-system, "Helvetica Neue", sans-serif';
    c.fillText(el.sym, S / 2, S / 2 + 34);
    c.font = '600 42px "PingFang SC", sans-serif';
    c.fillText(el.cn, S / 2, S / 2 + 94);
    c.font = '500 30px -apple-system, sans-serif';
    c.fillStyle = dark ? 'rgba(14,17,32,0.6)' : 'rgba(255,255,255,0.66)';
    c.fillText(el.mass, S / 2, S - 24);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texCache.set(key, tex);
  return tex;
}

/* ---------------- 元素瓦片 ---------------- */
const tileGroup = new THREE.Group();
scene.add(tileGroup);
const tiles = new Map(); // key -> { el, mesh, side, top, isPh }

const PLACEHOLDERS = [
  { key: 'ph-lanth', ph: true, phCn: '镧系', phRange: '57–71', cat: 'lanth', g: 3, p: 6, desc: '镧系元素 La–Lu 共 15 种，电子填入 4f 轨道，与主表第ⅢB 族同列，故以两行附加带置于下方。' },
  { key: 'ph-act', ph: true, phCn: '锕系', phRange: '89–103', cat: 'act', g: 3, p: 7, desc: '锕系元素 Ac–Lr 共 15 种，电子填入 5f 轨道，全部具有放射性。' },
];

function makeTile(el, isPh) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const side = new THREE.MeshStandardMaterial({
    color: catColor(el), roughness: 0.48, metalness: 0.22,
    emissive: catColor(el), emissiveIntensity: isPh ? 0.38 : 0.16,
  });
  const top = new THREE.MeshStandardMaterial({
    map: labelTexture(el, isPh), roughness: 0.42, metalness: 0.08,
    emissive: catColor(el), emissiveIntensity: 0.06,
  });
  const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  mesh.userData.key = isPh ? el.key : el.z;
  tileGroup.add(mesh);
  tiles.set(mesh.userData.key, { el, mesh, side, top, isPh });
  return mesh;
}
ELEMENTS.forEach(e => makeTile(e, false));
PLACEHOLDERS.forEach(e => makeTile(e, true));
window.__tiles = tiles; // 调试/测试句柄
window.__controls = controls;

/* ---------------- 三种排布 ---------------- */
const SP = 1.15;
function layoutClassic(t) {
  const e = t.el;
  let col, row;
  if (t.isPh) { col = e.g - 1; row = e.p - 1; }
  else if (e.g === null) {
    const i = e.z <= 71 ? e.z - 57 : e.z - 89;
    col = 3 + i; row = e.z <= 71 ? 7.55 : 8.6;
  } else { col = e.g - 1; row = e.p - 1; }
  const h = t.isPh ? 0.5 : heightOf(e);
  return {
    pos: new THREE.Vector3((col - 8.5) * SP, h / 2 + 0.02, (row - 4.3) * SP),
    rotY: 0, scale: new THREE.Vector3(0.92, h, 0.92), labelFace: 'top',
  };
}
const RING_CNT = { 1: 2, 2: 8, 3: 8, 4: 18, 5: 18, 6: 33, 7: 33 };
function ringFor(e) {
  if (e.z === 1 || e.z === 2) return e.z - 1;
  if (e.g !== null) return e.g <= 2 ? e.g - 1 : (e.p >= 4 ? e.g - 1 : e.g - 11);
  return (e.z <= 71 ? 18 + e.z - 57 : 18 + e.z - 89);
}
function layoutRings(t) {
  const e = t.el;
  const p = t.isPh ? e.p : e.p;
  const cnt = RING_CNT[p];
  const R = Math.max(1.4, (cnt * 0.99) / (2 * Math.PI));
  const idx = t.isPh ? (e.key === 'ph-lanth' ? 18 : 18) : ringFor(e);
  const th = (idx / cnt) * 2 * Math.PI;
  const y = (p - 1) * 1.18 + 0.5;
  return {
    pos: new THREE.Vector3(R * Math.cos(th), y, R * Math.sin(th)),
    rotY: Math.PI / 2 - th, // 标签朝外（观者在塔外）
    scale: new THREE.Vector3(0.95, 0.95, 0.13),
    labelFace: 'front',
  };
}
function layoutHelix(t) {
  const z = t.isPh ? (t.el.key === 'ph-lanth' ? 64 : 96) : t.el.z;
  const th = (z - 1) * (2 * Math.PI / 16);
  const R = 4.2;
  return {
    pos: new THREE.Vector3(R * Math.cos(th), (z - 59.5) * 0.34 + 0.07, R * Math.sin(th)),
    rotY: -th,
    scale: new THREE.Vector3(0.95, 0.13, 0.95),
    labelFace: 'top',
  };
}
const LAYOUTS = { classic: layoutClassic, rings: layoutRings, helix: layoutHelix };
const CAM_PRESET = {
  classic: { pos: [0, 16.5, 10.8], tgt: [0, 0.6, 2.3] },
  rings:   { pos: [11, 9.5, 15], tgt: [0, 3.4, 0] },
  helix:   { pos: [0, 20, 26], tgt: [0, 0, 0] },
};

function rebuild() {
  const lay = LAYOUTS[state.view];
  for (const t of tiles.values()) {
    // f 区占位块只在经典排布里有意义，其余两种排布直接隐藏
    t.mesh.visible = !(state.view !== 'classic' && t.isPh);
    if (!t.mesh.visible) continue;
    const { pos, rotY, scale, labelFace } = lay(t);
    t.mesh.position.copy(pos);
    t.mesh.rotation.y = rotY;
    t.mesh.scale.copy(scale);
    // 材质重排：顶面贴标签 或 正面贴标签
    if (labelFace === 'top') t.mesh.material = [t.side, t.side, t.top, t.side, t.side, t.side];
    else t.mesh.material = [t.side, t.side, t.side, t.side, t.top, t.side];
  }
  const pr = CAM_PRESET[state.view];
  tweenCamera(new THREE.Vector3(...pr.pos), new THREE.Vector3(...pr.tgt));
}

/* ---------------- 状态与可见性 ---------------- */
const state = { view: 'classic', prop: 'rad', hist: false, rot: false, search: '', legendSel: null, hover: null, selected: null };

function matchSearch(e) {
  if (!state.search.trim()) return true;
  if (e.ph) return false; // 占位块不匹配任何搜索词
  const q = state.search.trim().toLowerCase();
  return e.sym.toLowerCase() === q || e.cn.includes(state.search.trim())
    || e.en.toLowerCase().includes(q) || String(e.z) === q
    || e.sym.toLowerCase().startsWith(q);
}

function applyVisibility() {
  for (const t of tiles.values()) {
    const e = t.el;
    let o = 1, emi = t.isPh ? 0.38 : 0.16;
    if (state.hist && !t.isPh && !e.k1869) {
      if (e.pred) { o = 0.62; emi = 0.55; }      // 三大预言
      else { o = 0.13; emi = 0.05; }
    }
    if (state.hist && t.isPh) { o = 0.13; emi = 0.05; }
    if (state.legendSel && e.cat !== state.legendSel) o = Math.min(o, 0.12);
    if (state.search && !matchSearch(e)) o = Math.min(o, 0.08);
    if (state.search && matchSearch(e) && o < 1) o = Math.max(o, 0.9);
    if (state.hover === t.mesh.userData.key) { emi = 0.5; }
    if (state.selected === t.mesh.userData.key) { emi = 0.75; }
    for (const m of [t.side, t.top]) {
      const wasTrans = m.transparent;
      m.opacity = o;
      m.transparent = o < 1;
      m.depthWrite = o > 0.6;
      if (wasTrans !== m.transparent) m.needsUpdate = true; // 翻转透明态必须重编译
    }
    t.side.emissiveIntensity = emi;
    t.top.emissiveIntensity = emi * 0.4;
  }
}

/* ---------------- 相机补间 ---------------- */
let camAnim = null;
function tweenCamera(toPos, toTgt) {
  camAnim = {
    t0: performance.now(), dur: 850,
    fromP: camera.position.clone(), toP: toPos.clone(),
    fromT: controls.target.clone(), toT: toTgt.clone(),
  };
}
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/* ---------------- 交互 ---------------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(tileGroup.children, false).filter(h => h.object.visible);
  if (!hits.length) return null;
  return tiles.get(hits[0].object.userData.key);
}
renderer.domElement.addEventListener('pointermove', ev => {
  const t = pick(ev);
  const key = t ? t.mesh.userData.key : null;
  if (state.hover !== key) { state.hover = key; applyVisibility(); }
  renderer.domElement.style.cursor = t ? 'pointer' : 'grab';
});
renderer.domElement.addEventListener('pointerdown', ev => { downXY = [ev.clientX, ev.clientY]; });
renderer.domElement.addEventListener('pointerup', ev => {
  if (!downXY) return;
  const moved = Math.hypot(ev.clientX - downXY[0], ev.clientY - downXY[1]);
  downXY = null;
  if (moved > 6) return;
  const t = pick(ev);
  if (t) { state.selected = t.mesh.userData.key; showPanel(t); applyVisibility(); }
  else { state.selected = null; hidePanel(); applyVisibility(); }
});

/* ---------------- 详情面板 ---------------- */
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
const BLOCK = e => {
  if (e.cat === 'lanth' || e.cat === 'act') return 'f';
  if ([1, 2, 3, 4, 11, 12, 19, 20, 37, 38, 55, 56, 87, 88].includes(e.z)) return 's';
  if (e.cat === 'trans') return 'd';
  return 'p';
};
function showPanel(t) {
  const e = t.el;
  if (t.isPh) {
    panelBody.innerHTML = `
      <h2>${e.phCn} <span class="z">${e.phRange}</span></h2>
      <div class="en">f 区附加带</div>
      <dl>
        <dt>范围</dt><dd>${e.phRange} 号元素</dd>
        <dt>数量</dt><dd>15 种</dd>
      </dl>
      <div class="note dim2">${e.desc}</div>`;
  } else {
    const col = '#' + new THREE.Color(catColor(e)).getHexString();
    const yr = e.yr === -1 ? '古代' : e.yr + ' 年';
    const grp = e.g === null ? 'ⅢB（f 区）' : `第 ${e.g} 族`;
    const rows = [
      ['中文名', `${e.cn}（${e.sym}）`],
      ['相对原子质量', e.mass + (e.est ? '（最稳同位素）' : '')],
      ['周期 / 族', `第 ${e.p} 周期 · ${grp}`],
      ['分区', `${BLOCK(e)} 区`],
      ['电子排布', e.cfg],
      ['电负性', e.eneg == null ? '—' : e.eneg + '（泡令）'],
      ['共价半径', e.rad + ' pm' + (e.z >= 97 ? '（预测）' : '')],
      ['第一电离能', e.ie1 + ' kJ/mol' + (e.z >= 104 ? '（预测）' : '')],
      ['发现', `${yr} · ${e.en}`],
      ['常温物态', e.st + '态'],
    ];
    panelBody.innerHTML = `
      <h2>${e.sym} <span class="z">Z = ${e.z}</span></h2>
      <div class="en">${e.cn} · ${e.en}</div>
      <span class="catTag" style="color:${col};border-color:${col}55;background:${col}14">${CATS[e.cat].cn}</span>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${e.predNote ? `<div class="note">🔬 ${e.predNote}</div>` : ''}
      ${e.note1869 ? `<div class="note dim2">📜 ${e.note1869}</div>` : ''}
      ${e.est ? `<div class="note dim2">104 号及以后的人工元素半衰期极短，物理化学性质多为理论预测值。</div>` : ''}`;
  }
  panel.classList.remove('hidden');
}
function hidePanel() { panel.classList.add('hidden'); }
document.getElementById('panelClose').onclick = () => { state.selected = null; hidePanel(); applyVisibility(); };
addEventListener('keydown', ev => { if (ev.key === 'Escape') { state.selected = null; hidePanel(); applyVisibility(); } });

/* ---------------- UI 接线 ---------------- */
document.querySelectorAll('.btn.view').forEach(b => b.onclick = () => {
  document.querySelectorAll('.btn.view').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  state.view = b.dataset.view;
  document.getElementById('propRow').style.display = state.view === 'classic' ? '' : 'none';
  rebuild(); applyVisibility();
});
document.getElementById('propSel').onchange = ev => {
  state.prop = ev.target.value;
  if (state.view === 'classic') { rebuild(); applyVisibility(); }
};
document.getElementById('histChk').onchange = ev => { state.hist = ev.target.checked; applyVisibility(); refreshHistHint(); };
document.getElementById('rotChk').onchange = ev => { controls.autoRotate = ev.target.checked; };
document.getElementById('resetBtn').onclick = () => {
  const pr = CAM_PRESET[state.view];
  tweenCamera(new THREE.Vector3(...pr.pos), new THREE.Vector3(...pr.tgt));
};
document.getElementById('search').oninput = ev => {
  state.search = ev.target.value;
  applyVisibility();
  const n = ELEMENTS.filter(matchSearch).length;
  if (state.search.trim() && n > 0 && n <= 3) toast(`匹配 ${n} 个元素（高亮显示）`);
};
document.getElementById('glbBtn').onclick = () => {
  toast('正在导出 GLB…');
  new GLTFExporter().parse(tileGroup, gltf => {
    const blob = new Blob([gltf], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'periodic-table-3d.glb';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出 periodic-table-3d.glb');
  }, err => toast('导出失败：' + err.message), { binary: true });
};

function refreshHistHint() {
  if (!state.hist) return;
  const n = ELEMENTS.filter(e => e.k1869).length;
  toast(`1869 年视角：表内 ${n} 种元素已被确认，其余空位此后被逐一填上；镓、钪、锗亮起处即门捷列夫的三大预言`);
}

/* 图例 */
const legend = document.getElementById('legend');
const counts = {};
ELEMENTS.forEach(e => counts[e.cat] = (counts[e.cat] || 0) + 1);
Object.entries(CATS).forEach(([k, c]) => {
  const chip = document.createElement('div');
  chip.className = 'chip';
  const hex = '#' + new THREE.Color(c.color).getHexString();
  chip.innerHTML = `<span class="sw" style="background:${hex}"></span>${c.cn}<span class="n">${counts[k] || 0}</span>`;
  chip.onclick = () => {
    state.legendSel = state.legendSel === k ? null : k;
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
    if (state.legendSel) chip.classList.add('on');
    applyVisibility();
  };
  legend.appendChild(chip);
});

/* toast */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

/* ---------------- 结构内容叠加层：周期表做背景板 ---------------- */
const sheet = document.getElementById('sheet');
const sheetFrame = document.getElementById('sheetFrame');
let rotBefore = false;
function openSheet(src) {
  sheetFrame.src = src;
  sheet.classList.add('open');
  rotBefore = controls.autoRotate;
  controls.autoRotate = true; // 背景板缓转
}
function closeSheet() {
  if (!sheet.classList.contains('open')) return;
  sheet.classList.remove('open');
  sheetFrame.src = 'about:blank';
  controls.autoRotate = rotBefore;
}
document.getElementById('treeBtn').onclick = () => openSheet('./tree.html');
document.getElementById('chartsBtn').onclick = () => openSheet('./charts.html');
document.getElementById('sheetClose').onclick = closeSheet;
addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSheet(); });

/* ---------------- 主循环 ---------------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let pulseT = null;
rebuild();
applyVisibility();
document.getElementById('loading').remove();

renderer.setAnimationLoop(() => {
  if (camAnim) {
    const k = Math.min(1, (performance.now() - camAnim.t0) / camAnim.dur);
    const e = ease(k);
    camera.position.lerpVectors(camAnim.fromP, camAnim.toP, e);
    controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e);
    if (k >= 1) camAnim = null;
  }
  controls.update();
  renderer.render(scene, camera);
});
