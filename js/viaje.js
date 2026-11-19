// Retorcidos SMP · el viaje. La página es un corte del mundo: se baja desde la superficie del Overworld,
// se cruza el portal al Nether, se sube por la fortaleza al portal del End y se cae al vacío.
// Motor tomado del prototipo «Excavación» de Parabellum (capas, criaturas, HUD, barra rápida, minerales,
// sonidos y el pie que se descubre). Lo nuevo: las dimensiones, los dos cruces de portal, la caja de prueba
// (con los premios y pesos reales de cajas.yml), el pase (pase.yml) y el huevo del dragón.
// Los textos cortos vienen del JSON #ui-strings del HTML.
import { Pixel as P } from './pixel.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const S = JSON.parse($('#ui-strings').textContent);
const fmt = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const body = document.body;
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  paused: false,
  reduced: reducedQuery.matches,
  sound: false,
  metrics: null,
  active: null,
  level: 0,
  discovered: new Set(),
  ready: false,
  width: 0,
  theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  reveal: -1,
  inVoid: false,
  footerHeight: 0,
  dim: 'overworld',
};
const motion = () => !state.paused && !state.reduced;
body.classList.toggle('reduced', state.reduced);

const hero = $('#inicio');
const layers = $$('.layer');
const crossings = $$('.cruce');
// Todo lo que pinta un mundo de bloques: las capas y el fondo de los cruces.
const worlds = $$('[data-material]');
const sections = $$('#inicio, .layer, .cruce');
const fx = $('#fx');
const hotbar = $('#hotbar');
const mainEl = $('#main');
const footer = $('.site-footer');

// ---------------------------------------------------------------- medidas del mundo

function computeMetrics() {
  const width = document.documentElement.clientWidth;
  if (width >= 1100) {
    const bs = 48;
    return { bs, walls: clamp(Math.floor((width - 1120) / 2 / bs), 2, 4), shaft: true, groundRows: 4, width };
  }
  if (width >= 700) return { bs: 40, walls: 1, shaft: false, groundRows: 4, width };
  return { bs: 32, walls: 0, shaft: false, groundRows: 3, width };
}

function applyMetrics() {
  const m = (state.metrics = computeMetrics());
  const root = document.documentElement.style;
  root.setProperty('--bs', `${m.bs}px`);
  root.setProperty('--wall', `${m.walls * m.bs}px`);
  root.setProperty('--ground', `${m.groundRows * m.bs}px`);
  body.classList.toggle('has-shaft', m.shaft);
}

// ---------------------------------------------------------------- sprites declarados en el HTML

// «sprite:moon», «tex:cobble» o «iso:CARA_DE_ARRIBA|LADOS».
function spriteCanvas(spec) {
  const [kind, ...rest] = spec.split(':');
  const value = rest.join(':');
  if (kind === 'sprite') return P.sprite(value);
  if (kind === 'tex') return P.texture(value);
  if (kind === 'iso') {
    const [top, side] = value.split('|');
    return P.iso(top, side || top, 64);
  }
  throw new Error(`Sprite sin tipo: ${spec}`);
}
const pxUrl = spec => `url(${P.url(spriteCanvas(spec))})`;

function hydrate(root = document) {
  $$('[data-px]', root).forEach(el => el.style.setProperty('--px', pxUrl(el.dataset.px)));
}

// ---------------------------------------------------------------- las capas

function glow(className, point) {
  const el = document.createElement('i');
  el.className = className;
  el.style.left = `${point.x}px`;
  el.style.top = `${point.y}px`;
  el.style.animationDelay = `${-(Math.random() * 3).toFixed(2)}s`;
  return el;
}

function renderLayer(section, force, fade) {
  const m = state.metrics;
  const width = section.clientWidth;
  const height = section.offsetHeight;
  if (!width || !height) return;
  // Bajo tierra (y en el Nether y el End) no importa si arriba es de día: el mundo se pinta siempre igual.
  const key = `${width}x${height}x${m.bs}x${m.walls}`;
  if (!force && section.dataset.rendered === key) return;
  section.dataset.rendered = key;

  const result = P.world({
    material: section.dataset.material,
    width,
    height,
    bs: m.bs,
    walls: m.walls,
    // Los cruces no llevan la escalera del minero: es un cuarto, no el pozo.
    shaft: m.shaft && section.dataset.shaft !== 'none',
    seed: P.hash(section.id || section.dataset.seed || 'cruce'),
    theme: 'dark',
  });
  const canvas = result.canvas;
  canvas.className = 'world';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = `${result.cssWidth}px`;
  canvas.style.height = `${result.cssHeight}px`;
  const olds = section.querySelectorAll(':scope > canvas.world');
  const old = olds[olds.length - 1];
  if (old && fade) {
    // El mismo mundo con la luz nueva, encima del anterior, y se funde.
    canvas.classList.add('fade-in');
    old.after(canvas);
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('shown')));
    setTimeout(() => {
      olds.forEach(item => item.remove());
      canvas.classList.remove('fade-in', 'shown');
    }, 950);
  } else if (old) {
    olds.forEach((item, index) => (index === olds.length - 1 ? item.replaceWith(canvas) : item.remove()));
  } else {
    section.prepend(canvas);
  }

  let layerFx = section.querySelector(':scope > .fx');
  if (!layerFx) {
    layerFx = document.createElement('div');
    layerFx.className = 'fx';
    layerFx.setAttribute('aria-hidden', 'true');
    canvas.after(layerFx);
  } else if (!fade) {
    canvas.after(layerFx);
  }
  layerFx.replaceChildren(
    ...result.torches.map(p => glow('torch-glow', p)),
    ...result.lava.map(p => glow('lava-glow', p)),
    ...result.glows.map(p => glow('ore-glow', p)),
    ...result.crystals.slice(0, 8).map(p => glow('crystal-glint', p)),
    ...result.rods.map(p => glow('rod-glow', p)),
  );
  addParticles(section);
}

// Brasas que suben en el Nether y motas moradas en el End (una vez por capa; solo se mueven a la vista).
function addParticles(section) {
  const kind = section.dataset.particles;
  if (!kind || section.querySelector(':scope > .particles')) return;
  const box = document.createElement('div');
  box.className = `particles ${kind}`;
  box.setAttribute('aria-hidden', 'true');
  const random = P.mulberry32(P.hash(`${section.id}-p`));
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement('i');
    dot.style.left = `${(random() * 100).toFixed(1)}%`;
    dot.style.top = `${(20 + random() * 75).toFixed(1)}%`;
    dot.style.animationDuration = `${(6 + random() * 7).toFixed(1)}s`;
    dot.style.animationDelay = `${(-random() * 12).toFixed(1)}s`;
    box.append(dot);
  }
  section.querySelector(':scope > .fx').after(box);
}

const renderTimers = new Map();
function scheduleRender(section) {
  clearTimeout(renderTimers.get(section));
  renderTimers.set(section, setTimeout(() => renderLayer(section), 140));
}
const layerObserver = new ResizeObserver(entries => entries.forEach(entry => scheduleRender(entry.target)));

// ---------------------------------------------------------------- la superficie

function renderHero() {
  const m = state.metrics;
  const width = hero.clientWidth;
  const ground = P.ground({ width, bs: m.bs, rows: m.groundRows, shaft: m.shaft, seed: 77 });
  const groundEl = $('#ground');
  groundEl.width = ground.canvas.width;
  groundEl.height = ground.canvas.height;
  const ctx = groundEl.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ground.canvas, 0, 0);
  groundEl.style.width = `${ground.cssWidth}px`;
  groundEl.style.height = `${ground.cssHeight}px`;

  drawSky();
  // Las mismas colinas con dos luces: de noche moradas y de día azul lejano y verde cercano.
  drawHills($('#hills-far'), 11, 0.42, 0.95, '#291760', '#33207a');
  drawHills($('#hills-near'), 23, 0.18, 0.62, '#1c0f46', '#24145a');
  drawHills($('#hills-far-day'), 11, 0.42, 0.95, '#86b3e4', '#a3c8ef');
  drawHills($('#hills-near-day'), 23, 0.18, 0.62, '#5e9e4f', '#77b866');
  placeFlowers();
}

function drawSky() {
  const sky = $('#sky');
  const scale = 3;
  const w = Math.ceil(hero.clientWidth / scale);
  const h = Math.ceil(hero.offsetHeight / scale);
  sky.width = w;
  sky.height = h;
  const ctx = sky.getContext('2d');
  const random = P.mulberry32(91);
  const count = Math.round((w * h) / 260);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(random() * w);
    const y = Math.floor(random() * h * 0.8);
    // Menos estrellas detrás del texto, para que se lea bien.
    if (x < w * 0.55 && y > h * 0.12 && y < h * 0.72 && random() < 0.85) continue;
    ctx.fillStyle = ['#ffffff', '#e9dcff', '#c9b6ff', '#a58cff'][Math.floor(random() * 4)];
    ctx.globalAlpha = 0.35 + random() * 0.65;
    ctx.fillRect(x, y, 1, 1);
    if (random() < 0.08) {
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }
  ctx.globalAlpha = 1;
}

function drawHills(canvas, seed, minHeight, maxHeight, color, rim) {
  const step = state.metrics.bs / 4;
  const w = Math.ceil(hero.clientWidth / step);
  const h = Math.ceil((canvas.offsetHeight || 260) / step);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const random = P.mulberry32(seed);
  const knots = [];
  for (let i = 0; i <= w / 6 + 2; i++) knots.push(minHeight + random() * (maxHeight - minHeight));
  for (let x = 0; x < w; x++) {
    const k = Math.floor(x / 6);
    const t = (x % 6) / 6;
    const top = h - Math.round((knots[k] * (1 - t) + knots[k + 1] * t) * h);
    ctx.fillStyle = color;
    ctx.fillRect(x, top, 1, h - top);
    ctx.fillStyle = rim;
    ctx.fillRect(x, top, 1, 1);
  }
}

function placeFlowers() {
  const m = state.metrics;
  const scale = m.bs >= 48 ? 3 : 2;
  const width = hero.clientWidth;
  const random = P.mulberry32(5);
  const kinds = ['poppy', 'dandelion', 'tuft', 'tuft', 'poppy', 'tuft', 'dandelion', 'tuft'];
  $('#flowers').replaceChildren(
    ...kinds.map((kind, index) => {
      const canvas = P.sprite(kind);
      const el = document.createElement('i');
      el.style.setProperty('--px', `url(${P.url(canvas)})`);
      el.style.width = `${canvas.width * scale}px`;
      el.style.height = `${canvas.height * scale}px`;
      el.style.left = `${clamp(((index + 0.5) / kinds.length) * width + (random() - 0.5) * 60, m.bs * 1.5, width - 40)}px`;
      return el;
    }),
  );
}

const pointer = { x: -9999, y: -9999, nx: 0.5 };
hero.addEventListener('pointermove', event => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.nx = event.clientX / innerWidth;
  requestFrame();
});
hero.addEventListener('pointerleave', () => {
  pointer.x = pointer.y = -9999;
});

function updateParallax() {
  if (!motion()) return;
  const offset = Math.min(scrollY, hero.offsetHeight);
  const shift = pointer.nx - 0.5;
  const far = `translate(${shift * -14}px, ${offset * 0.12}px)`;
  const near = `translate(${shift * -28}px, ${offset * 0.06}px)`;
  $('#hills-far').style.transform = far;
  $('#hills-far-day').style.transform = far;
  $('#hills-near').style.transform = near;
  $('#hills-near-day').style.transform = near;
  $('#sky-bodies').style.transform = `translate(${shift * 10}px, ${offset * 0.3}px)`;
}

// ---------------------------------------------------------------- criaturas

const MOB_INFO = {
  sheep: { w: 20, h: 14, speed: 26 },
  pig: { w: 18, h: 12, speed: 30 },
  chicken: { w: 12, h: 13, speed: 36 },
  creeper: { w: 8, h: 16, speed: 0 },
};
const WOOL = ['#ece8f2', '#c9a8ff', '#7ff3ea', '#ffd84a', '#ff9fc3', '#8fe082', '#5a4a72'];
const mobs = [];
const mobScale = () => (state.metrics.bs >= 48 ? 4 : 3);

function setMobFrames(mob) {
  mob.el.style.setProperty('--f0', `url(${P.url(P.mob(mob.kind, 0, mob.color))})`);
  if (mob.kind !== 'creeper') mob.el.style.setProperty('--f1', `url(${P.url(P.mob(mob.kind, 1, mob.color))})`);
}

function sizeMob(mob) {
  const scale = mobScale();
  const info = MOB_INFO[mob.kind];
  mob.w = info.w * scale;
  mob.el.style.width = `${info.w * scale}px`;
  mob.el.style.height = `${info.h * scale}px`;
}

const placeMob = mob => {
  mob.el.style.transform = `translateX(${mob.x}px) scaleX(${mob.dir})`;
};

function makeMob(kind, lane, options = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `mob mob-${kind}`;
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  const mob = { kind, el, lane, x: 0, dir: options.dir || 1, state: 'idle', timer: 0.5 + Math.random() * 2, color: options.color, frame: 0, frameTime: 0, flee: 0, w: 0 };
  setMobFrames(mob);
  sizeMob(mob);
  $('#mobs').append(el);
  mobs.push(mob);
  return mob;
}

function layoutMobs() {
  const width = $('#mobs').clientWidth;
  mobs.forEach(mob => {
    sizeMob(mob);
    mob.x = clamp(mob.lane * width, 10, width - mob.w - 10);
    placeMob(mob);
  });
}

function hop(el) {
  el.classList.remove('hop');
  void el.offsetWidth;
  el.classList.add('hop');
}

function setupMobs() {
  const wide = state.metrics.width >= 700;
  const creeper = makeMob('creeper', wide ? 0.62 : 0.66, { dir: 1 });
  const sheep = makeMob('sheep', wide ? 0.73 : 0.08, { dir: -1, color: WOOL[0] });
  const pig = makeMob('pig', wide ? 0.88 : 0.4, { dir: 1 });
  const chicken = makeMob('chicken', wide ? 0.5 : 0.82, { dir: -1 });
  layoutMobs();

  // El creeper se infla si lo miras mucho, pero aquí nada explota.
  let primeTimer;
  let fizzleTimer;
  const calm = () => {
    clearTimeout(primeTimer);
    clearTimeout(fizzleTimer);
    creeper.el.classList.remove('primed');
  };
  const prime = () => {
    clearTimeout(primeTimer);
    primeTimer = setTimeout(() => {
      creeper.el.classList.add('primed');
      sound('fuse');
      clearTimeout(fizzleTimer);
      fizzleTimer = setTimeout(() => {
        calm();
        toast(S.creeperTitle, S.creeperText, 'sprite:creeper');
      }, 1800);
    }, state.reduced ? 0 : 600);
  };
  creeper.el.addEventListener('pointerenter', prime);
  creeper.el.addEventListener('pointerleave', calm);
  creeper.el.addEventListener('click', prime);

  sheep.el.addEventListener('click', () => {
    sheep.wool = ((sheep.wool || 0) + 1) % WOOL.length;
    sheep.color = WOOL[sheep.wool];
    setMobFrames(sheep);
    hop(sheep.el);
    burst(sheep.el, [sheep.color, '#ffffff'], 8, { size: 6 });
    sound('pop');
  });
  pig.el.addEventListener('click', () => {
    hop(pig.el);
    burst(pig.el, [], 5, { px: pxUrl('sprite:heart'), cls: 'heart', rise: true, duration: 1100 });
    sound('pop');
  });
  chicken.el.addEventListener('click', () => {
    hop(chicken.el);
    burst(chicken.el, [], 6, { px: pxUrl('sprite:feather'), cls: 'feather', duration: 900 });
    sound('pop');
  });
}

let heroVisible = true;
let lastTime = 0;
function mobLoop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (motion() && heroVisible && mobs.length) {
    const lane = $('#mobs').getBoundingClientRect();
    const minX = state.metrics.shaft ? state.metrics.bs * 1.5 : 6;
    const maxX = lane.width - 6;
    for (const mob of mobs) {
      if (mob.kind === 'creeper') continue;
      const info = MOB_INFO[mob.kind];
      const center = lane.left + mob.x + mob.w / 2;
      const near = Math.abs(pointer.x - center) < 85 && pointer.y > lane.top - 150 && pointer.y < lane.top + 30;
      if (near && mob.flee <= 0) {
        mob.flee = 0.9;
        mob.dir = pointer.x < center ? 1 : -1;
        mob.state = 'walk';
      }
      if (mob.flee > 0) mob.flee -= dt;
      mob.timer -= dt;
      if (mob.timer <= 0 && mob.flee <= 0) {
        if (mob.state === 'walk') {
          mob.state = 'idle';
          mob.timer = 1 + Math.random() * 2.5;
          mob.el.classList.remove('step');
        } else {
          mob.state = 'walk';
          mob.dir = Math.random() < 0.5 ? 1 : -1;
          mob.timer = 1.2 + Math.random() * 2.6;
        }
      }
      if (mob.state === 'walk') {
        mob.x += mob.dir * info.speed * (mob.flee > 0 ? 3.4 : 1) * (mobScale() / 4) * dt;
        if (mob.x < minX) {
          mob.x = minX;
          mob.dir = 1;
        }
        if (mob.x > maxX - mob.w) {
          mob.x = maxX - mob.w;
          mob.dir = -1;
        }
        mob.frameTime += dt;
        if (mob.frameTime > (mob.flee > 0 ? 0.08 : 0.17)) {
          mob.frameTime = 0;
          mob.frame ^= 1;
          mob.el.classList.toggle('step', mob.frame === 1);
        }
      }
      placeMob(mob);
    }
  }
  requestAnimationFrame(mobLoop);
}

// ---------------------------------------------------------------- el bloque del logo

function setupDropLogo() {
  const drop = $('#drop-logo');
  drop.addEventListener('click', () => {
    if (drop.classList.contains('taken')) return;
    const img = $('img', drop);
    const from = img.getBoundingClientRect();
    const to = $('#brand img').getBoundingClientRect();
    drop.classList.add('taken');
    sound('pop');
    toast(S.picked, S.logoBlock, 'sprite:key-comun');
    if (motion()) {
      const ghost = img.cloneNode();
      ghost.style.cssText = `position:absolute;left:0;top:0;width:${from.width}px;height:${from.height}px;`;
      fx.append(ghost);
      ghost.animate(
        [
          { transform: `translate(${from.left}px, ${from.top}px) scale(1)` },
          { transform: `translate(${(from.left + to.left) / 2}px, ${Math.min(from.top, to.top) - 60}px) scale(.8)`, offset: 0.5 },
          { transform: `translate(${to.left - (from.width - to.width) / 2}px, ${to.top - (from.height - to.height) / 2}px) scale(${to.width / from.width})` },
        ],
        { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)' },
      ).onfinish = () => {
        ghost.remove();
        hop($('#brand img'));
        xpBurst($('#brand'), $('.xp'), 4);
      };
    }
    setTimeout(() => {
      drop.classList.remove('taken');
      drop.classList.add('respawn');
      setTimeout(() => drop.classList.remove('respawn'), 900);
    }, 4200);
  });
}

// ---------------------------------------------------------------- scroll: profundidad, HUD y minero

let framePending = false;
function requestFrame() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(() => {
    framePending = false;
    onFrame();
  });
}

let lastScroll = scrollY;
let idleTimer;

function onFrame() {
  const y = scrollY;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  // El rebote de arriba toma el color del cielo; el de abajo, el negro del vacío (ver html en global.css).
  document.documentElement.classList.toggle('near-top', y < innerHeight * 0.5);
  $('#xp-fill').style.width = `${clamp(y / max, 0, 1) * 100}%`;

  const probe = innerHeight * 0.42;
  let active = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= probe) active = section;
  }
  if (active !== state.active) setActive(active);

  const delta = y - lastScroll;
  lastScroll = y;
  hotbar.classList.toggle('in-hero', y < hero.offsetHeight * 0.55);
  if (delta > 8) hotbar.classList.add('tucked');
  else if (delta < -8) hotbar.classList.remove('tucked');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => hotbar.classList.remove('tucked'), 650);

  updateHud(y, delta);
  updateMiner();
  updateParallax();
  updateCrossings();
  updateVoid();
}

// El HUD de arriba (las dos islas) se esconde al bajar, para leer sin nada encima, y vuelve al subir. Se
// queda arriba del todo, con el mouse cerca del borde de arriba o con la lista de capas abierta. Los enlaces
// de texto solo se ven en la superficie.
const header = $('#site-header');
let pointerNearTop = false;
function updateHud(y, delta) {
  body.classList.toggle('below-surface', y > innerHeight * 0.5);
  const keep = y < 140 || pointerNearTop || !$('#biome-list').hidden;
  if (keep || delta < -6) header.classList.remove('is-hidden');
  else if (delta > 6) header.classList.add('is-hidden');
}
document.addEventListener(
  'pointermove',
  event => {
    pointerNearTop = event.pointerType === 'mouse' && event.clientY < 80;
    if (pointerNearTop) header.classList.remove('is-hidden');
  },
  { passive: true },
);

// El HUD dice la capa en la que se está, o «Y -64 · El vacío» con el pie a la vista. La dimensión la
// pone la capa (data-dim) o el cruce, que la cambia a la mitad de pasar el portal.
const DIM_COLORS = { overworld: '#120a28', nether: '#2a0a0a', end: '#0c0716' };
function showDepth() {
  const section = state.active;
  $('#f3-y').textContent = state.inVoid ? 'Y -64' : `Y ${section.dataset.y}`;
  $('#f3-biome').textContent = state.inVoid ? S.voidBiome : section.dataset.biome;
  const dim = state.inVoid ? 'end' : section.dataset.crossed || section.dataset.dim || 'overworld';
  setDim(dim);
}

function setDim(dim) {
  if (dim === state.dim) return;
  state.dim = dim;
  body.dataset.dim = dim;
  const tag = $('#f3-dim');
  tag.textContent = dim === 'end' ? 'the_end' : dim === 'nether' ? 'the_nether' : 'overworld';
  tag.classList.remove('flash');
  void tag.offsetWidth;
  tag.classList.add('flash');
  $('meta[name="theme-color"]').setAttribute('content', DIM_COLORS[dim]);
}

// El pie se descubre solo si cabe entero debajo del encabezado; si no (teléfonos, ventanas bajas), es un
// pie normal que llega con el scroll.
function fitFooter() {
  state.footerHeight = footer.offsetHeight;
  body.classList.toggle('footer-reveal', state.footerHeight <= innerHeight - $('.site-header').offsetHeight);
  state.reveal = -1;
  requestFrame();
}

// Cuánto se ve el vacío: 0 mientras la roca madre lo tapa, 1 con el pie entero a la vista.
function updateVoid() {
  const shown = innerHeight - mainEl.getBoundingClientRect().bottom;
  const reveal = clamp(shown / Math.max(1, state.footerHeight), 0, 1);
  if (Math.abs(reveal - state.reveal) < 0.002) return;
  state.reveal = reveal;
  footer.style.setProperty('--reveal', reveal.toFixed(3));
  footer.classList.toggle('open', reveal > 0);
  const inVoid = reveal > 0.4;
  if (inVoid !== state.inVoid) {
    state.inVoid = inVoid;
    body.classList.toggle('in-void', inVoid);
    showDepth();
  }
}

function setActive(section) {
  state.active = section;
  const index = sections.indexOf(section);
  showDepth();
  $('#xp-level').textContent = String(index);
  if (index > state.level) {
    state.level = index;
    gainXp();
  }
  $$('a', hotbar).forEach(link => link.classList.toggle('active', link.hash === `#${section.id}`));
  $$('#biome-list a').forEach(link => link.classList.toggle('active', link.hash === `#${section.id}`));
  // Bajar a una capa nueva sube el nivel de la barra de experiencia (sin avisos que tapen el texto).
  if (state.ready && index > 0 && !state.discovered.has(section.id)) {
    state.discovered.add(section.id);
    sound('level');
  }
}

const miner = $('#miner');
const minerFrames = {};
function updateMiner() {
  if (!state.metrics.shaft) return;
  if (!minerFrames.front) {
    for (const name of ['front', 'climbA', 'climbB']) minerFrames[name] = pxUrl(`sprite:miner-${name}`);
  }
  const height = 60;
  const groundTop = $('#ground').getBoundingClientRect().top;
  const bottom = layers[layers.length - 1].getBoundingClientRect().bottom;
  const fixedY = innerHeight * 0.48;
  let top = Math.max(fixedY, groundTop - height + 6);
  top = Math.min(top, bottom - height - 8);
  const onSurface = groundTop - height + 6 >= fixedY - 1;
  const frame = onSurface ? 'front' : Math.floor(scrollY / 28) % 2 ? 'climbA' : 'climbB';
  miner.style.transform = `translateY(${top}px)`;
  if (miner.dataset.frame !== frame) {
    miner.dataset.frame = frame;
    miner.style.setProperty('--miner', minerFrames[frame]);
  }
}

// ---------------------------------------------------------------- barra rápida y lista de capas

function buildNavigation() {
  layers.forEach((section, index) => {
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.setAttribute('aria-label', `${index + 1}: ${section.dataset.label}`);
    link.dataset.tip = `${section.dataset.label}|${fmt(S.key, { n: index + 1 })} · ${section.dataset.biome}`;
    const number = document.createElement('span');
    number.textContent = String(index + 1);
    const icon = document.createElement('i');
    icon.style.setProperty('--px', pxUrl(section.dataset.icon));
    link.append(number, icon);
    hotbar.append(link);
  });
  hotbar.addEventListener('focusin', () => hotbar.classList.remove('tucked'));
  document.addEventListener(
    'pointermove',
    event => {
      if (event.clientY > innerHeight - 90) hotbar.classList.remove('tucked');
    },
    { passive: true },
  );

  const list = $('#biome-list');
  [hero, ...layers].forEach(section => {
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    const name = document.createElement('b');
    name.textContent = section.dataset.label;
    const y = document.createElement('span');
    y.textContent = `Y ${section.dataset.y}`;
    link.append(name, y);
    link.addEventListener('click', () => setBiomes(false));
    list.append(link);
  });
  $('#f3-chip').addEventListener('click', () => setBiomes(list.hidden));
  document.addEventListener('click', event => {
    if (!event.target.closest('.f3')) setBiomes(false);
  });
}

function setBiomes(open) {
  $('#biome-list').hidden = !open;
  $('#f3-chip').setAttribute('aria-expanded', String(open));
}

// ---------------------------------------------------------------- logros, tooltip y efectos

const iconValue = icon => (!icon ? null : icon.startsWith('url(') ? icon : pxUrl(icon));

function toast(title, text, icon) {
  const box = $('#toasts');
  box.replaceChildren();
  const el = document.createElement('div');
  el.className = 'toast';
  const value = iconValue(icon);
  if (value) {
    const i = document.createElement('i');
    i.style.setProperty('--px', value);
    el.append(i);
  }
  const textBox = document.createElement('span');
  const small = document.createElement('small');
  small.textContent = title;
  const bold = document.createElement('b');
  bold.textContent = text;
  textBox.append(small, bold);
  el.append(textBox);
  box.append(el);
  setTimeout(() => el.classList.add('out'), 2500);
  setTimeout(() => el.remove(), 2850);
}

const tooltip = $('#tooltip');
function showTip(el) {
  const [title, sub] = el.dataset.tip.split('|');
  tooltip.replaceChildren(document.createTextNode(title));
  if (sub) {
    const small = document.createElement('small');
    small.textContent = sub;
    tooltip.append(small);
  }
  tooltip.hidden = false;
  const rect = el.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  if (el.closest('.hotbar') && body.classList.contains('has-shaft')) {
    tooltip.style.left = `${rect.left - tip.width - 12}px`;
    tooltip.style.top = `${rect.top + rect.height / 2 - tip.height / 2}px`;
    return;
  }
  let top = rect.top - tip.height - 10;
  if (top < 72) top = rect.bottom + 10;
  tooltip.style.left = `${clamp(rect.left + rect.width / 2 - tip.width / 2, 8, innerWidth - tip.width - 8)}px`;
  tooltip.style.top = `${top}px`;
}
const hideTip = () => {
  tooltip.hidden = true;
};
document.addEventListener('pointerover', event => {
  const target = event.target.closest('[data-tip]');
  if (target && event.pointerType === 'mouse') showTip(target);
});
document.addEventListener('pointerout', event => {
  if (event.target.closest('[data-tip]')) hideTip();
});
document.addEventListener('focusin', event => {
  const target = event.target.closest('[data-tip]');
  if (target) showTip(target);
  else hideTip();
});
addEventListener('scroll', hideTip, { passive: true });

function center(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function burst(el, colors, count = 10, options = {}) {
  if (!motion()) return;
  const origin = center(el);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = `particle${options.cls ? ` ${options.cls}` : ''}`;
    if (options.px) {
      p.style.setProperty('--px', options.px);
    } else {
      const size = options.size || 5 + Math.random() * 5;
      p.style.width = p.style.height = `${size}px`;
      p.style.background = colors[i % colors.length];
    }
    fx.append(p);
    const angle = Math.random() * Math.PI * 2;
    const distance = 26 + Math.random() * 48;
    const dx = Math.cos(angle) * distance;
    const dy = options.rise ? -40 - Math.random() * 40 : Math.sin(angle) * distance - 26;
    const fall = options.rise ? -50 : 90;
    p.animate(
      [
        { transform: `translate(${origin.x}px, ${origin.y}px)`, opacity: 1 },
        { transform: `translate(${origin.x + dx * 0.7}px, ${origin.y + dy}px)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${origin.x + dx}px, ${origin.y + dy + fall}px)`, opacity: 0 },
      ],
      { duration: options.duration || 750, easing: 'cubic-bezier(.2,.6,.4,1)' },
    ).onfinish = () => p.remove();
  }
}

function xpBurst(fromEl, toEl, count = 6, done) {
  if (!motion()) {
    gainXp();
    if (done) done();
    return;
  }
  const a = center(fromEl);
  const b = center(toEl);
  // Si la experiencia va al F3 y el HUD está escondido, el HUD baja a recibirla: el destino es donde va a
  // quedar, no donde está ahora.
  if (header.contains(toEl)) {
    b.y -= new DOMMatrixReadOnly(getComputedStyle(header).transform).m42;
    header.classList.remove('is-hidden');
  }
  const orbUrl = pxUrl('sprite:orb');
  for (let i = 0; i < count; i++) {
    const orb = document.createElement('i');
    orb.className = 'orb';
    orb.style.setProperty('--px', orbUrl);
    fx.append(orb);
    const mid = { x: (a.x + b.x) / 2 + (Math.random() - 0.5) * 140, y: Math.min(a.y, b.y) - 60 - Math.random() * 80 };
    orb.animate(
      [
        { transform: `translate(${a.x - 7}px, ${a.y - 7}px) scale(.4)` },
        { transform: `translate(${mid.x - 7}px, ${mid.y - 7}px) scale(1.1)`, offset: 0.5 },
        { transform: `translate(${b.x - 7}px, ${b.y - 7}px) scale(.7)` },
      ],
      { duration: 700 + i * 50, delay: i * 70, easing: 'ease-in-out', fill: 'both' },
    ).onfinish = () => {
      orb.remove();
      sound('xp');
      if (i === count - 1) {
        gainXp();
        if (done) done();
      }
    };
  }
}

function gainXp() {
  const xp = $('.xp');
  xp.classList.remove('gain');
  void xp.offsetWidth;
  xp.classList.add('gain');
}

// ---------------------------------------------------------------- sonidos (apagados al empezar)

let audio = null;
function audioContext() {
  if (!audio) audio = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
  return audio;
}
function beep(freq, duration, { type = 'square', volume = 0.035, to } = {}) {
  const a = audioContext();
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, a.currentTime + duration);
  gain.gain.setValueAtTime(volume, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
  osc.connect(gain).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + duration + 0.02);
}
function noise(duration, volume, freq) {
  const a = audioContext();
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * duration), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = a.createBufferSource();
  source.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const gain = a.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(a.destination);
  source.start();
}
const SOUNDS = {
  hit: () => noise(0.05, 0.5, 1300),
  break: () => noise(0.18, 0.7, 650),
  pop: () => beep(480, 0.09, { type: 'sine', to: 920, volume: 0.06 }),
  xp: () => beep(1100 + Math.random() * 500, 0.05, { type: 'sine', volume: 0.025 }),
  level: () => {
    beep(523, 0.09);
    setTimeout(() => beep(784, 0.14), 95);
  },
  msg: () => {
    beep(880, 0.08, { type: 'sine', volume: 0.05 });
    setTimeout(() => beep(1320, 0.1, { type: 'sine', volume: 0.05 }), 90);
  },
  click: () => beep(640, 0.03, { volume: 0.03 }),
  fuse: () => noise(0.6, 0.25, 3200),
  dawn: () => [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.16, { type: 'sine', volume: 0.04 }), i * 120)),
  dusk: () => [784, 659, 523].forEach((f, i) => setTimeout(() => beep(f, 0.18, { type: 'sine', volume: 0.035 }), i * 140)),
  tick: () => beep(1250, 0.018, { volume: 0.018 }),
  // El pedernal contra la obsidiana y el zumbido del portal.
  ignite: () => {
    noise(0.12, 0.6, 3000);
    setTimeout(() => beep(150, 0.6, { type: 'sawtooth', to: 260, volume: 0.025 }), 80);
  },
  portal: () => {
    noise(1.1, 0.35, 420);
    beep(110, 1.3, { type: 'sine', to: 340, volume: 0.06 });
  },
  eye: n => beep(520 + (n || 1) * 36, 0.09, { type: 'sine', volume: 0.05 }),
  open: () => [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, { type: 'sine', volume: 0.045 }), i * 90)),
  teleport: () => beep(980, 0.28, { type: 'sawtooth', to: 160, volume: 0.025 }),
};
function sound(name, arg) {
  if (!state.sound) return;
  try {
    SOUNDS[name](arg);
  } catch {
    // Sin audio en este navegador: la página sigue igual.
  }
}

// ---------------------------------------------------------------- minerales

const mined = new Set();
function setupMine(button) {
  const block = button.dataset.block;
  const base = block.startsWith('ore:') ? block.split(':')[1] : block;
  const label = button.getAttribute('aria-label');
  const isDiamond = button.id === 'diamond-mine';
  button.style.setProperty('--tex', `url(${P.url(P.texture(block, 1))})`);
  button.style.setProperty('--air', `url(${P.url(P.shaded(base, 2, 0.32))})`);
  button.dataset.tip = `${button.dataset.name}|${S.holdToMine}`;
  const mine = { stage: 0, broken: false, timer: null };

  const stop = () => {
    clearInterval(mine.timer);
    mine.timer = null;
  };
  const hit = () => {
    if (mine.broken) return;
    mine.stage++;
    button.style.setProperty('--crack', `url(${P.url(P.crack(mine.stage))})`);
    button.classList.remove('hit');
    void button.offsetWidth;
    button.classList.add('hit');
    sound('hit');
    burst(button, P.colorsOf(block), 3, { size: 5 });
    if (mine.stage >= 5) breakBlock();
  };
  const breakBlock = () => {
    stop();
    mine.broken = true;
    button.classList.add('broken');
    button.style.removeProperty('--crack');
    button.setAttribute('aria-label', fmt(S.mined, { name: button.dataset.name }));
    burst(button, P.colorsOf(block), 14);
    sound('break');
    const dropCanvas = P.dropFor(block);
    const drop = document.createElement('i');
    drop.className = `drop${button.classList.contains('mine-big') ? ' big' : ''}`;
    drop.style.setProperty('--px', `url(${P.url(dropCanvas)})`);
    button.parentElement.append(drop);
    const first = !mined.has(block);
    mined.add(block);
    if (!isDiamond) toast(first ? S.achievement : S.picked, button.dataset.name, `url(${P.url(dropCanvas)})`);
    setTimeout(() => {
      const target = isDiamond ? $('#copiar-java') : $('.xp');
      xpBurst(drop, target, isDiamond ? 9 : 5, () => {
        if (!isDiamond) return;
        target.classList.add('pulse');
        setTimeout(() => target.classList.remove('pulse'), 2000);
      });
      drop.classList.add('gone');
      setTimeout(() => drop.remove(), 400);
    }, 1300);
    setTimeout(() => {
      mine.broken = false;
      mine.stage = 0;
      button.classList.remove('broken');
      button.classList.add('restore');
      button.setAttribute('aria-label', label);
      setTimeout(() => button.classList.remove('restore'), 600);
    }, 9000);
  };

  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || mine.broken) return;
    event.preventDefault();
    hit();
    stop();
    mine.timer = setInterval(hit, 190);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => button.addEventListener(type, stop));
  // Con teclado (Enter o Espacio) cada pulsación es un golpe.
  button.addEventListener('click', event => {
    if (event.detail === 0) hit();
  });
}

// ---------------------------------------------------------------- día y noche (solo en la superficie)

// Bajo tierra siempre es de noche: el sol y la luna cambian solo el cielo, las colinas y el texto del héroe.
const THEME_KEY = 'retorcidos-cielo';
let themeTimer;

function updateThemeChrome() {
  const light = state.theme === 'light';
  const button = $('#theme-toggle');
  const label = light ? button.dataset.labelDark : button.dataset.labelLight;
  button.setAttribute('aria-label', label);
  button.title = label;
}

// El color del texto del héroe cambia con Web Animations: cada texto se funde por su cuenta, al paso del cielo.
function fadeText(apply) {
  const targets = new Set();
  const walker = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement && node.data.trim()) targets.add(node.parentElement);
  }
  const list = [...targets];
  const before = list.map(element => {
    const style = getComputedStyle(element);
    return { color: style.color, textShadow: style.textShadow };
  });
  apply();
  list.forEach((element, index) => {
    const style = getComputedStyle(element);
    const from = {};
    const to = {};
    for (const property of ['color', 'textShadow']) {
      if (style[property] === before[index][property]) continue;
      from[property] = before[index][property];
      to[property] = style[property];
    }
    if (Object.keys(to).length) element.animate([from, to], { duration: 1500, easing: 'ease-in-out' });
  });
}

function setTheme(theme, { store = true } = {}) {
  if (theme !== 'light' && theme !== 'dark') return;
  if (store) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Sin almacenamiento: el cielo dura lo que dure la visita.
    }
  }
  if (theme === state.theme) return;
  state.theme = theme;
  const animate = motion() && !document.hidden && heroVisible;
  const apply = () => {
    document.documentElement.dataset.theme = theme;
  };
  if (animate) {
    body.classList.add('theme-switching');
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => body.classList.remove('theme-switching'), 2000);
    fadeText(apply);
  } else {
    apply();
  }
  updateThemeChrome();
  sound(theme === 'light' ? 'dawn' : 'dusk');
}

function setupTheme() {
  updateThemeChrome();
  $('#theme-toggle').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
  $$('.sky-body').forEach(bodyEl => bodyEl.addEventListener('click', () => setTheme(bodyEl.dataset.to)));
}

// Pájaros de día y estrellas fugaces de noche.
function setupSkyLife() {
  const birds = $('#birds');
  const frames = [pxUrl('sprite:bird-0'), pxUrl('sprite:bird-1')];
  [
    { top: '16%', duration: 42, delay: -6 },
    { top: '21%', duration: 48, delay: -20 },
    { top: '13%', duration: 57, delay: -33 },
  ].forEach(({ top, duration, delay }) => {
    const bird = document.createElement('i');
    bird.className = 'bird';
    bird.style.top = top;
    bird.style.setProperty('--b0', frames[0]);
    bird.style.setProperty('--b1', frames[1]);
    bird.style.animationDuration = `${duration}s, .45s`;
    bird.style.animationDelay = `${delay}s, ${(Math.random() * -0.45).toFixed(2)}s`;
    birds.append(bird);
  });

  const stars = $('#shooting-stars');
  setInterval(() => {
    if (!motion() || !heroVisible || state.theme !== 'dark' || document.hidden || Math.random() < 0.4) return;
    const star = document.createElement('i');
    star.className = 'shooting-star';
    star.style.left = `${45 + Math.random() * 45}%`;
    star.style.top = `${4 + Math.random() * 26}%`;
    stars.append(star);
    setTimeout(() => star.remove(), 1300);
  }, 6500);
}

// ---------------------------------------------------------------- galería: las capturas con shaders

let currentShot = 0;
let frames = [];

function showShot(index) {
  const lightbox = $('#lightbox');
  currentShot = (index + frames.length) % frames.length;
  const frame = frames[currentShot];
  const img = $('#lightbox-img');
  img.src = frame.dataset.full;
  img.alt = frame.dataset.alt;
  $('#lightbox-count').textContent = fmt(S.gallery.count, { n: currentShot + 1, total: frames.length });
  if (!lightbox.open) lightbox.showModal();
}

function setupGallery() {
  const lightbox = $('#lightbox');
  if (!lightbox) return;
  frames = $$('.frame');
  frames.forEach((frame, index) =>
    frame.addEventListener('click', () => {
      showShot(index);
      sound('pop');
    }),
  );
  $('#lightbox-prev').addEventListener('click', () => showShot(currentShot - 1));
  $('#lightbox-next').addEventListener('click', () => showShot(currentShot + 1));
  $('#lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') showShot(currentShot - 1);
    if (event.key === 'ArrowRight') showShot(currentShot + 1);
  });
  lightbox.addEventListener('close', () => frames[currentShot]?.focus());
}

// ---------------------------------------------------------------- los cruces de portal

// Cada cruce es una sección alta con un escenario pegado a la pantalla; el avance del scroll (0 a 1) lo
// mueve. En el del Nether el marco de obsidiana se prende y crece hasta tragarse la pantalla. En el del End
// se ponen los doce ojos uno por uno, se abre el portal y se cae dentro. Pasando la mitad cambia la dimensión.
const ease = t => t * t * (3 - 2 * t);
const span = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

function setupCrossings() {
  crossings.forEach(section => {
    section.cruce = { kind: section.dataset.cruce, p: -1, lit: false, eyes: 0, open: false, crossed: false };
    if (section.cruce.kind === 'nether') {
      const frame = $('.np-frame', section);
      const sprite = P.sprite('portalFrame');
      frame.width = sprite.width;
      frame.height = sprite.height;
      frame.getContext('2d').drawImage(sprite, 0, 0);
      const swirl = $('.np-swirl', section);
      swirl.width = 32;
      swirl.height = 48;
    } else {
      const ring = $('.ep-ring', section);
      const cells = [];
      // El anillo de 5 × 5 sin esquinas, en el orden en que se ponen los ojos (con las manecillas del reloj).
      const order = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4], [4, 3], [4, 2], [4, 1], [3, 0], [2, 0], [1, 0]];
      order.forEach(([row, col], index) => {
        const cell = document.createElement('i');
        cell.className = 'ep-frame';
        cell.style.gridArea = `${row + 1} / ${col + 1}`;
        cell.style.setProperty('--a', `url(${P.url(P.texture('endframeTop', index % 4))})`);
        cell.style.setProperty('--b', `url(${P.url(P.texture('endframeEye', index % 4))})`);
        // Los marcos miran hacia adentro: se giran según el lado.
        cell.style.rotate = `${row === 0 ? 180 : row === 4 ? 0 : col === 0 ? 90 : -90}deg`;
        ring.append(cell);
        cells.push(cell);
      });
      section.cruce.cells = cells;
      const sky = $('.ep-void', section);
      sky.width = 48;
      sky.height = 48;
      section.cruce.stars = [0, 1, 2].map(layer => {
        const random = P.mulberry32(300 + layer);
        return Array.from({ length: 26 - layer * 6 }, () => ({ x: random() * 48, y: random() * 48, c: Math.floor(random() * 5) }));
      });
      // El piso de la fortaleza, visto desde arriba.
      const floor = P.makeCanvas(16 * 8, 16 * 8);
      const ctx = floor.getContext('2d');
      const random = P.mulberry32(77);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) ctx.drawImage(P.shaded(random() < 0.12 ? 'cobble' : 'stonebrick', Math.floor(random() * 4), 0.42), c * 16, r * 16);
      }
      $('.cruce-stage', section).style.setProperty('--floor', `url(${P.url(floor)})`);
    }
  });
}

const PORTAL_COLORS = [[38, 8, 84], [58, 16, 132], [86, 30, 186], [120, 56, 226], [164, 98, 255], [104, 40, 206], [70, 22, 160]];
const STAR_COLORS = ['#1e7a6a', '#2fb39a', '#9fe8d2', '#6a4cc0', '#d0b4ff'];

function drawSwirl(canvas, t) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v =
        Math.sin(x * 0.55 + t * 2.1) +
        Math.sin(y * 0.38 - t * 1.6) +
        Math.sin((x + y) * 0.3 + t * 1.2) +
        Math.sin(Math.hypot(x - w / 2, y - h / 2) * 0.7 - t * 3);
      const color = PORTAL_COLORS[Math.min(PORTAL_COLORS.length - 1, Math.floor(((v + 4) / 8) * PORTAL_COLORS.length))];
      const i = (y * w + x) * 4;
      image.data[i] = color[0];
      image.data[i + 1] = color[1];
      image.data[i + 2] = color[2];
      image.data[i + 3] = 235;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function drawStarfield(canvas, stars, t) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#050d0d';
  ctx.fillRect(0, 0, 48, 48);
  stars.forEach((layer, index) => {
    const speed = 2 + index * 3;
    layer.forEach(star => {
      const x = Math.floor((star.x + t * speed * (index % 2 ? -1 : 1)) % 48 + 48) % 48;
      const y = Math.floor((star.y + t * speed * 0.6) % 48 + 48) % 48;
      ctx.fillStyle = STAR_COLORS[star.c];
      ctx.fillRect(x, y, index === 2 ? 2 : 1, index === 2 ? 2 : 1);
    });
  });
}

// Los portales se mueven solos (a unos 12 cuadros por segundo) mientras su cruce está a la vista.
let lastPortal = 0;
function portalLoop(time) {
  if (time - lastPortal > 80) {
    lastPortal = time;
    const t = time / 1000;
    crossings.forEach(section => {
      const c = section.cruce;
      if (!c || section.classList.contains('is-offscreen')) return;
      const still = !motion();
      if (c.kind === 'nether' && c.lit && (!still || !c.drawn)) {
        drawSwirl($('.np-swirl', section), still ? 1 : t);
        c.drawn = true;
      }
      if (c.kind === 'end' && c.open && (!still || !c.drawn)) {
        drawStarfield($('.ep-void', section), c.stars, still ? 1 : t);
        c.drawn = true;
      }
    });
  }
  requestAnimationFrame(portalLoop);
}

function updateCrossings() {
  let inside = false;
  crossings.forEach(section => {
    const rect = section.getBoundingClientRect();
    const total = rect.height - innerHeight;
    const p = clamp(-rect.top / Math.max(1, total), 0, 1);
    if (rect.bottom < -50 || rect.top > innerHeight + 50) return;
    if (p > 0.01 && p < 0.99) inside = true;
    const c = section.cruce;
    if (Math.abs(p - c.p) < 0.0005) return;
    const forward = p > c.p;
    c.p = p;
    const stage = $('.cruce-stage', section);
    stage.style.setProperty('--t', (1 - span(p, 0.08, 0.32)).toFixed(3));
    stage.style.setProperty('--n', state.reduced ? '0' : span(p, 0.45, 0.85).toFixed(3));
    if (c.kind === 'nether') updateNether(section, stage, c, p, forward);
    else updateEnd(section, stage, c, p, forward);
    const crossed = p > (c.kind === 'nether' ? 0.78 : 0.82);
    if (crossed !== c.crossed) {
      c.crossed = crossed;
      section.dataset.crossed = crossed ? c.kind : '';
      if (crossed && forward) sound('portal');
      if (state.active === section) showDepth();
    }
  });
  body.classList.toggle('in-cruce', inside);
}

// Mueve y escala el portal para que su centro llegue al centro de la pantalla y lo cubra todo.
function grow(el, stage, g, innerW, innerH) {
  const box = stage.getBoundingClientRect();
  const base = el.dataset.base ? JSON.parse(el.dataset.base) : null;
  const rect = base || (() => {
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    const value = { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    el.dataset.base = JSON.stringify(value);
    return value;
  })();
  const target = Math.max(innerWidth / innerW, innerHeight / innerH) * 1.15;
  const scale = state.reduced ? 1 : 1 + (target - 1) * g;
  const dx = (box.width / 2 - rect.x) * g;
  const dy = (box.height / 2 - rect.y) * g;
  el.style.transform = state.reduced ? 'none' : `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
}

function updateNether(section, stage, c, p, forward) {
  const lit = p > 0.07;
  if (lit !== c.lit) {
    c.lit = lit;
    c.drawn = false;
    stage.classList.toggle('lit', lit);
    if (lit && forward) {
      sound('ignite');
      burst($('.np-swirl', section), ['#a462ff', '#6b3df0', '#e9dcff'], 12, { size: 6 });
    }
  }
  const bs = state.metrics.bs;
  grow($('.np', section), stage, ease(span(p, 0.16, 0.84)), bs * 2, bs * 3);
  stage.style.setProperty('--o', span(p, 0.6, 0.84).toFixed(3));
  stage.style.setProperty('--o2', span(p, 0.84, 0.98).toFixed(3));
}

function updateEnd(section, stage, c, p, forward) {
  const eyes = Math.floor(span(p, 0.04, 0.44) * 12 + 1e-6);
  if (eyes !== c.eyes) {
    c.cells.forEach((cell, index) => cell.classList.toggle('on', index < eyes));
    if (eyes > c.eyes && forward) {
      sound('eye', eyes);
      const cell = c.cells[eyes - 1];
      if (cell) burst(cell, ['#3fb37a', '#9fe8d2', '#0b1a12'], 5, { size: 5 });
    }
    c.eyes = eyes;
  }
  const open = eyes === 12 && p > 0.46;
  if (open !== c.open) {
    c.open = open;
    c.drawn = false;
    stage.classList.toggle('open', open);
    if (open && forward) sound('open');
  }
  const cell = $('.ep-ring', section).offsetWidth / 5;
  grow($('.ep-ring', section), stage, ease(span(p, 0.5, 0.88)), cell * 3, cell * 3);
  stage.style.setProperty('--o', span(p, 0.84, 0.98).toFixed(3));
}

// ---------------------------------------------------------------- la caja de prueba (datos de cajas.yml)

// [objeto, cantidad, peso, encantamientos, nombre]. Mismos premios y pesos que el server.
const CAJAS = {
  comun: {
    color: '#d4d4d8',
    premios: [
      ['bread', 16, 14], ['cooked_beef', 12, 12], ['iron_ingot', 8, 14], ['coal', 24, 12], ['arrow', 32, 10],
      ['gold_ingot', 6, 8], ['emerald', 5, 8], ['experience_bottle', 8, 8], ['ender_pearl', 2, 6], ['diamond', 1, 4],
      ['enchanted_book', 1, 4, { efficiency: 3 }], ['enchanted_book', 1, 4, { protection: 3 }], ['golden_apple', 1, 3],
      ['name_tag', 1, 3], ['enchanted_book', 1, 4, { replanter: 1 }], ['enchanted_book', 1, 4, { lucky_miner: 1 }],
      ['enchanted_book', 1, 3, { haste: 1 }],
    ],
  },
  rara: {
    color: '#60a5fa',
    premios: [
      ['diamond', 3, 14], ['golden_apple', 3, 12], ['experience_bottle', 24, 12], ['ender_pearl', 6, 10],
      ['enchanted_book', 1, 8, { sharpness: 5 }], ['enchanted_book', 1, 8, { protection: 4 }], ['enchanted_book', 1, 8, { efficiency: 5 }],
      ['enchanted_book', 1, 6, { unbreaking: 3 }], ['enchanted_book', 1, 4, { fortune: 3 }], ['enchanted_book', 1, 3, { mending: 1 }],
      ['obsidian', 16, 6], ['shulker_shell', 2, 3], ['diamond_pickaxe', 1, 4, { efficiency: 5, unbreaking: 3 }, 'Pico del Minero'],
      ['enchanted_book', 1, 5, { veinminer: 1 }], ['enchanted_book', 1, 5, { treefeller: 1 }], ['enchanted_book', 1, 5, { smelter: 2 }],
      ['enchanted_book', 1, 4, { vampire: 1 }], ['enchanted_book', 1, 3, { telekinesis: 1 }],
    ],
  },
  epica: {
    color: '#c084fc',
    premios: [
      ['diamond', 8, 14], ['netherite_scrap', 2, 10], ['enchanted_book', 1, 10, { mending: 1 }], ['enchanted_book', 1, 8, { sharpness: 6 }],
      ['enchanted_book', 1, 8, { protection: 5 }], ['enchanted_book', 1, 8, { efficiency: 6 }], ['enchanted_book', 1, 6, { unbreaking: 5 }],
      ['totem_of_undying', 1, 6], ['enchanted_golden_apple', 1, 4],
      ['diamond_sword', 1, 6, { sharpness: 6, unbreaking: 3, looting: 3 }, 'Hoja Retorcida'],
      ['diamond_pickaxe', 1, 6, { efficiency: 6, unbreaking: 4, fortune: 3, veinminer: 2 }, 'Pico Voraz'],
      ['elytra', 1, 2], ['enchanted_book', 1, 6, { veinminer: 3 }], ['enchanted_book', 1, 5, { double_strike: 2 }],
      ['enchanted_book', 1, 5, { regrowth: 2 }], ['enchanted_book', 1, 4, { silk_chest: 1 }], ['enchanted_book', 1, 4, { soulbound: 1 }],
    ],
  },
  legendaria: {
    color: '#f59e0b',
    premios: [
      ['netherite_ingot', 1, 14], ['enchanted_book', 1, 10, { sharpness: 8 }], ['enchanted_book', 1, 10, { protection: 6 }],
      ['enchanted_book', 1, 8, { efficiency: 8 }], ['enchanted_book', 1, 6, { fortune: 4 }], ['totem_of_undying', 2, 8], ['elytra', 1, 6],
      ['netherite_sword', 1, 5, { sharpness: 8, unbreaking: 5, looting: 4, fire_aspect: 2, vampire: 2 }, 'Colmillo del Retorcido'],
      ['diamond_chestplate', 1, 6, { protection: 6, unbreaking: 5, mending: 1 }, 'Coraza del Guardián'],
      ['netherite_pickaxe', 1, 4, { efficiency: 8, unbreaking: 5, fortune: 4, mending: 1, veinminer: 3, telekinesis: 1 }, 'Pico del Abismo'],
      ['beacon', 1, 3], ['enchanted_book', 1, 6, { soulbound: 1 }], ['enchanted_book', 1, 5, { silk_spawner: 1 }],
      ['enchanted_book', 1, 5, { dragon_heart: 3 }], ['shulker_box', 1, 6],
    ],
  },
};

const ITEMS = {
  bread: ['Pan', 'sprite:bread'],
  cooked_beef: ['Filete', 'sprite:steak'],
  cooked_porkchop: ['Chuleta cocinada', 'sprite:porkchop'],
  iron_ingot: ['Lingote de hierro', 'sprite:ingot-iron'],
  gold_ingot: ['Lingote de oro', 'sprite:ingot-gold'],
  netherite_ingot: ['Lingote de netherita', 'sprite:ingot-netherite'],
  coal: ['Carbón', 'sprite:lump-coal'],
  netherite_scrap: ['Fragmento de netherita', 'sprite:lump-netherite'],
  ancient_debris: ['Escombros ancestrales', 'iso:tint:#6b4a3a,#5a3d30,#7d5a48,#4a3026|tint:#6b4a3a,#5a3d30,#7d5a48,#4a3026'],
  arrow: ['Flecha', 'sprite:arrow'],
  emerald: ['Esmeralda', 'sprite:gem-emerald'],
  diamond: ['Diamante', 'sprite:gem-diamond'],
  lapis_lazuli: ['Lapislázuli', 'sprite:gem-lapis'],
  experience_bottle: ['Frasco de experiencia', 'sprite:bottle'],
  ender_pearl: ['Perla de ender', 'sprite:pearl'],
  enchanted_book: ['Libro encantado', 'sprite:book'],
  golden_apple: ['Manzana dorada', 'sprite:apple-gold'],
  enchanted_golden_apple: ['Manzana dorada encantada', 'sprite:apple-gold'],
  golden_carrot: ['Zanahoria dorada', 'sprite:carrot'],
  name_tag: ['Etiqueta', 'sprite:tag'],
  saddle: ['Montura', 'sprite:saddle'],
  obsidian: ['Obsidiana', 'iso:obsidian|obsidian'],
  shulker_shell: ['Caparazón de shulker', 'iso:purpur|purpur'],
  shulker_box: ['Caja de shulker', 'iso:purpur|purpur'],
  diamond_pickaxe: ['Pico de diamante', 'sprite:pickaxe'],
  netherite_pickaxe: ['Pico de netherita', 'sprite:pickaxe-netherite'],
  diamond_sword: ['Espada de diamante', 'sprite:sword-diamond'],
  netherite_sword: ['Espada de netherita', 'sprite:sword-netherite'],
  diamond_chestplate: ['Peto de diamante', 'sprite:chest-diamond'],
  totem_of_undying: ['Tótem de la inmortalidad', 'sprite:totem'],
  elytra: ['Élitros', 'sprite:elytra'],
  beacon: ['Faro', 'iso:tint:#bdfcf6,#7ff3ea,#e6fffc,#4fe3db|tint:#bdfcf6,#7ff3ea,#e6fffc,#4fe3db'],
  torch: ['Antorcha', 'sprite:torch'],
  oak_log: ['Tronco de roble', 'iso:planks|log'],
  iron_block: ['Bloque de hierro', 'iso:tint:#e6e6e6,#d0d0d0,#f4f4f4,#bcbcbc|tint:#e6e6e6,#d0d0d0,#f4f4f4,#bcbcbc'],
  diamond_block: ['Bloque de diamante', 'iso:tint:#7ff3ea,#5fe0d6,#b5fff9,#3fbfb5|tint:#7ff3ea,#5fe0d6,#b5fff9,#3fbfb5'],
  blaze_rod: ['Vara de blaze', 'sprite:rod'],
};
const KEY_NAMES = { comun: 'Llave común', rara: 'Llave rara', epica: 'Llave épica', legendaria: 'Llave legendaria' };
const ENCHANTS = {
  efficiency: 'Eficiencia', protection: 'Protección', sharpness: 'Filo', unbreaking: 'Irrompibilidad', fortune: 'Fortuna',
  mending: 'Reparación', looting: 'Botín', fire_aspect: 'Aspecto ígneo', sweeping_edge: 'Filo arrasador',
  replanter: 'Replantador', lucky_miner: 'Minero afortunado', haste: 'Prisa', veinminer: 'Minero de vetas', treefeller: 'Leñador',
  smelter: 'Fundidor', vampire: 'Vampiro', telekinesis: 'Telequinesis', double_strike: 'Golpe doble', regrowth: 'Recuperación',
  silk_chest: 'Cofre de seda', soulbound: 'Alma ligada', silk_spawner: 'Generador de seda', dragon_heart: 'Corazón de dragón',
};
const ROMAN = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const enchantText = (id, level) => `${ENCHANTS[id] || id}${ROMAN[level] ? ` ${ROMAN[level]}` : ''}`;

// Un premio como lo dice el juego: «Libro: Filo V», «Pico del Minero» o «Diamante ×3».
function prizeName([item, count, , enchants, custom]) {
  let name = custom || (ITEMS[item] ? ITEMS[item][0] : item);
  if (item.startsWith('llave:')) name = KEY_NAMES[item.slice(6)];
  else if (item === 'enchanted_book' && enchants) name = `Libro: ${Object.entries(enchants).map(([id, level]) => enchantText(id, level)).join(', ')}`;
  return count > 1 ? `${name} ×${count}` : name;
}
const prizeSprite = item => (item.startsWith('llave:') ? `sprite:key-${item.slice(6)}` : ITEMS[item] ? ITEMS[item][1] : 'sprite:book');
const isShiny = ([item, , , enchants]) => item === 'enchanted_book' || item === 'enchanted_golden_apple' || Boolean(enchants);

function slotFor(prize) {
  const slot = document.createElement('span');
  slot.className = `slot${isShiny(prize) ? ' glint' : ''}`;
  const icon = document.createElement('i');
  icon.style.setProperty('--px', pxUrl(prizeSprite(prize[0])));
  slot.append(icon);
  if (prize[1] > 1) {
    const count = document.createElement('b');
    count.textContent = String(prize[1]);
    slot.append(count);
  }
  return slot;
}

function weightedPick(premios, random = Math.random) {
  const total = premios.reduce((sum, prize) => sum + prize[2], 0);
  let roll = random() * total;
  for (const prize of premios) {
    roll -= prize[2];
    if (roll < 0) return prize;
  }
  return premios[premios.length - 1];
}

function setupCrate() {
  const box = $('#caja');
  if (!box) return;
  const strip = $('.crate-strip', box);
  const result = $('.crate-result', box);
  const button = $('#caja-girar');
  const tabs = $$('[data-caja]', box);
  let current = 'comun';
  let spinning = false;
  const LAND = 34;

  const fill = (premios, prize) => {
    const items = Array.from({ length: LAND + 6 }, (_, index) => (index === LAND && prize ? prize : weightedPick(premios)));
    strip.replaceChildren(...items.map(slotFor));
  };
  const select = id => {
    if (spinning) return;
    current = id;
    tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.caja === id)));
    box.style.setProperty('--caja', CAJAS[id].color);
    $('.crate-title', box).textContent = fmt(S.crate.title, { name: $(`[data-caja="${id}"] span`, box).textContent });
    strip.getAnimations().forEach(animation => animation.cancel());
    strip.style.transform = 'none';
    fill(CAJAS[id].premios);
    result.replaceChildren();
    sound('click');
  };
  tabs.forEach(tab => tab.addEventListener('click', () => select(tab.dataset.caja)));

  button.addEventListener('click', () => {
    if (spinning) return;
    spinning = true;
    button.disabled = true;
    const crate = CAJAS[current];
    const prize = weightedPick(crate.premios);
    fill(crate.premios, prize);
    result.replaceChildren();
    const slotWidth = strip.firstElementChild.getBoundingClientRect().width;
    const end = -(LAND - 4) * slotWidth;
    const finish = () => {
      spinning = false;
      button.disabled = false;
      strip.children[LAND].classList.add('win');
      const total = crate.premios.reduce((sum, p) => sum + p[2], 0);
      const chance = ((prize[2] / total) * 100).toFixed(1);
      const name = document.createElement('b');
      name.textContent = prizeName(prize);
      result.append(name, document.createTextNode(` · ${fmt(S.crate.chance, { n: chance })}`));
      toast(S.crate.won, prizeName(prize), prizeSprite(prize[0]));
      sound('level');
      burst(strip.children[LAND], [crate.color, '#ffffff', '#ffd84a'], 14);
    };
    if (!motion()) {
      strip.style.transform = `translateX(${end}px)`;
      finish();
      return;
    }
    const animation = strip.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${end}px)` }], {
      duration: 4600,
      easing: 'cubic-bezier(.1,.72,.12,1)',
      fill: 'forwards',
    });
    let lastSlot = 0;
    const tick = () => {
      if (!spinning) return;
      const x = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41;
      const slot = Math.round(-x / slotWidth);
      if (slot !== lastSlot) {
        lastSlot = slot;
        sound('tick');
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    animation.onfinish = finish;
  });
  select('comun');
}

// ---------------------------------------------------------------- el pase de 60 días (datos de pase.yml)

const PASE = [
  [['bread', 16], ['torch', 32]], [['iron_ingot', 8]], [['cooked_beef', 16]], [['coal', 32], ['oak_log', 32]], [['llave:comun', 2], ['iron_ingot', 8]],
  [['iron_ingot', 12]], [['golden_carrot', 16]], [['arrow', 48]], [['lapis_lazuli', 24]], [['llave:rara', 1], ['diamond', 2]],
  [['experience_bottle', 16]], [['gold_ingot', 12]], [['cooked_porkchop', 24]], [['ender_pearl', 4]], [['llave:comun', 3], ['diamond', 3]],
  [['iron_block', 2]], [['golden_apple', 2]], [['obsidian', 16]], [['experience_bottle', 24]], [['llave:rara', 2], ['diamond', 4]],
  [['emerald', 16]], [['blaze_rod', 6]], [['golden_carrot', 32]], [['enchanted_book', 1, 0, { mending: 1 }]], [['llave:epica', 1]],
  [['diamond', 5]], [['ender_pearl', 8]], [['experience_bottle', 32]], [['name_tag', 2], ['saddle', 1]],
  [['totem_of_undying', 1, 0, null, 'Tótem de la mitad del camino'], ['llave:rara', 2], ['diamond', 6]],
  [['iron_block', 4]], [['golden_apple', 4]], [['enchanted_book', 1, 0, { protection: 5 }]], [['emerald', 24]], [['llave:epica', 1], ['diamond', 6]],
  [['netherite_scrap', 2]], [['experience_bottle', 48]], [['shulker_shell', 2]], [['enchanted_book', 1, 0, { efficiency: 6 }]], [['llave:rara', 3], ['diamond_block', 1]],
  [['golden_carrot', 64]], [['ancient_debris', 2]], [['enchanted_book', 1, 0, { unbreaking: 5 }]], [['ender_pearl', 16]], [['llave:epica', 2], ['totem_of_undying', 1]],
  [['diamond_block', 2]], [['enchanted_golden_apple', 1]], [['experience_bottle', 64]], [['netherite_ingot', 1]], [['llave:legendaria', 1], ['diamond_block', 3]],
  [['shulker_box', 1]], [['enchanted_book', 1, 0, { sharpness: 7 }]], [['netherite_ingot', 1]], [['enchanted_golden_apple', 1]], [['llave:epica', 2], ['totem_of_undying', 2]],
  [['diamond_block', 4]], [['enchanted_book', 1, 0, { fortune: 5 }]], [['netherite_ingot', 2]], [['experience_bottle', 64], ['llave:rara', 3]],
  [['netherite_sword', 1, 0, { sharpness: 7 }, 'Filo Retorcido'], ['elytra', 1, 0, { unbreaking: 5 }, 'Alas Retorcidas'], ['llave:legendaria', 2], ['totem_of_undying', 3], ['beacon', 1]],
];

function setupPass() {
  const grid = $('#pase-grid');
  if (!grid) return;
  PASE.forEach((rewards, index) => {
    const day = index + 1;
    // En el cuadro va el premio que más pesa del día: la llave si hay, si no el primero.
    const main = rewards.find(prize => prize[0].startsWith('llave:')) || rewards[0];
    const slot = slotFor(main);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${slot.className}${day % 5 === 0 ? ' big' : ''}${day === 60 ? ' last' : ''}`;
    button.replaceChildren(...slot.childNodes);
    const number = document.createElement('small');
    number.textContent = String(day);
    button.prepend(number);
    const names = day === 60 ? S.pass.legend : rewards.map(prizeName).join(' · ');
    button.dataset.tip = `${fmt(S.pass.day, { n: day })}|${names}`;
    button.setAttribute('aria-label', `${fmt(S.pass.day, { n: day })}: ${rewards.map(prizeName).join(', ')}`);
    button.addEventListener('click', () => {
      sound('click');
      burst(button, day === 60 ? ['#ffe066', '#ff4d4d', '#ffffff'] : ['#d8ff9a', '#ffffff'], day === 60 ? 14 : 5, { size: 5 });
    });
    grid.append(button);
  });
}

// ---------------------------------------------------------------- el chat del clan

// Un degradado letra por letra, como los nombres de clan del server.
function gradient(text, from, to) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const letters = [...text];
  const fragment = document.createDocumentFragment();
  letters.forEach((letter, index) => {
    const t = letters.length > 1 ? index / (letters.length - 1) : 0;
    const channel = shift => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
    const span = document.createElement('span');
    span.style.color = `rgb(${channel(16)},${channel(8)},${channel(0)})`;
    span.textContent = letter;
    fragment.append(span);
  });
  return fragment;
}

function setupClanChat() {
  const chat = $('#chat');
  if (!chat) return;
  const fire = ['#ff4d4d', '#ffb000'];
  const line = (className, ...parts) => {
    const p = document.createElement('p');
    if (className) p.className = className;
    parts.forEach(part => p.append(typeof part === 'string' ? document.createTextNode(part) : part));
    return p;
  };
  const bold = node => {
    const b = document.createElement('b');
    b.append(node);
    return b;
  };
  const gray = text => {
    const span = document.createElement('span');
    span.className = 'gris';
    span.textContent = text;
    return span;
  };
  const light = text => {
    const span = document.createElement('span');
    span.className = 'claro';
    span.textContent = text;
    return span;
  };
  const tag = () => bold(gradient('[Lobos]', ...fire));
  const clanMessage = ([name, text]) => [
    line('doble', bold(gradient('CHAT DEL CLAN', ...fire)), ' ', gray('·'), ' ', tag()),
    line('', gray(' »'), ' ', bold(document.createTextNode(name)), gray(':'), ' ', light(text)),
  ];
  // En el chat general el nombre va en el primer color del clan.
  const publicMessage = ([name, text]) => [line('', tag(), ' ', bold(gradient(name, fire[0], fire[0])), ' ', gray('»'), ' ', light(text))];

  const script = S.chat;
  let index = 0;
  const push = () => {
    const entry = script[index % script.length];
    index++;
    const lines = entry[0] === 'cc' ? clanMessage(entry.slice(1)) : publicMessage(entry.slice(1));
    lines.forEach(p => {
      if (motion()) p.classList.add('new');
      chat.append(p);
    });
    while (chat.children.length > 7) chat.firstElementChild.remove();
    if (state.ready && !chat.closest('.is-offscreen')) sound('msg');
  };
  for (let i = 0; i < 2; i++) push();
  setInterval(() => {
    if (!motion() || document.hidden || chat.closest('.is-offscreen')) return;
    push();
  }, 3800);
}

// ---------------------------------------------------------------- el huevo del dragón

// Como en el juego: al tocarlo se teletransporta a otro lado. A la tercera, un logro.
function setupEgg() {
  const egg = $('#huevo');
  if (!egg) return;
  const stage = egg.parentElement;
  let jumps = 0;
  const random = P.mulberry32(9);
  egg.addEventListener('click', () => {
    burst(egg, ['#b06cf7', '#3a2150', '#e9dcff'], 14, { size: 5 });
    sound('teleport');
    const x = 8 + random() * 76;
    const y = 4 + random() * 52;
    egg.style.left = `${x.toFixed(1)}%`;
    egg.style.top = `${y.toFixed(1)}%`;
    egg.classList.remove('hop');
    void egg.offsetWidth;
    egg.classList.add('hop');
    jumps++;
    if (jumps === 3) {
      toast(S.achievement, S.egg, 'sprite:egg');
      sound('level');
    }
    requestAnimationFrame(() => burst(egg, ['#b06cf7', '#e9dcff'], 8, { size: 4 }));
  });
  stage.addEventListener('pointerdown', event => {
    if (event.target === stage) hideTip();
  });
}

// ---------------------------------------------------------------- copiar las direcciones

function setupCopy() {
  $$('[data-copy]').forEach(button => {
    const label = $('.copy-label', button);
    const original = label ? label.textContent : '';
    button.addEventListener('click', async () => {
      const value = button.dataset.copy;
      let ok = false;
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch {
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;opacity:0';
        document.body.append(field);
        field.select();
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
        field.remove();
      }
      toast(ok ? S.copied : S.copyFailed, value, 'sprite:tag');
      sound(ok ? 'pop' : 'click');
      if (label && ok) {
        label.textContent = S.copiedShort;
        clearTimeout(button.copyTimer);
        button.copyTimer = setTimeout(() => (label.textContent = original), 1600);
      }
    });
  });
}

// El bloque de la marca (nylium distorsionado, en pixel) va en el encabezado, en el pie y como ícono.
function setupBrand() {
  $$('img[data-px-img]').forEach(img => {
    img.src = P.url(spriteCanvas(img.dataset.pxImg));
  });
  const icon = $('link[rel="icon"]');
  if (icon) {
    icon.type = 'image/png';
    icon.href = P.url(P.iso('warpedTop', 'warpedNylium', 64));
  }
}

// ---------------------------------------------------------------- encabezado y teclado

function setupChrome() {
  let splashIndex = 0;
  $('#splash').addEventListener('click', () => {
    splashIndex = (splashIndex + 1) % S.splash.length;
    $('#splash').textContent = S.splash[splashIndex];
    sound('pop');
  });

  const pause = $('#pause-motion');
  pause.addEventListener('click', () => {
    state.paused = !state.paused;
    body.classList.toggle('paused', state.paused);
    const label = state.paused ? S.header.resume : S.header.pause;
    pause.setAttribute('aria-pressed', String(state.paused));
    pause.setAttribute('aria-label', label);
    pause.title = label;
  });

  const soundButton = $('#sound-toggle');
  soundButton.addEventListener('click', () => {
    state.sound = !state.sound;
    const label = state.sound ? S.header.soundOff : S.header.soundOn;
    soundButton.setAttribute('aria-pressed', String(state.sound));
    soundButton.setAttribute('aria-label', label);
    soundButton.title = label;
    if (state.sound) sound('msg');
  });

  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if ($('#lightbox')?.open) return;
    const active = document.activeElement;
    if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
    if (event.key === 'Escape') {
      setBiomes(false);
      hideTip();
    } else if (/^[1-9]$/.test(event.key)) {
      const link = hotbar.children[Number(event.key) - 1];
      if (link) {
        event.preventDefault();
        hotbar.classList.remove('tucked');
        link.click();
      }
    }
  });

  reducedQuery.addEventListener('change', event => {
    state.reduced = event.matches;
    body.classList.toggle('reduced', state.reduced);
    crossings.forEach(section => (section.cruce.p = -1));
    requestFrame();
  });
}

// ---------------------------------------------------------------- pausar lo que no se ve

function observeVisibility() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
        if (entry.target === hero) heroVisible = entry.isIntersecting;
      });
    },
    { rootMargin: '150px' },
  );
  sections.forEach(section => observer.observe(section));
}

// ---------------------------------------------------------------- arranque

function relayout() {
  const width = document.documentElement.clientWidth;
  if (width === state.width) {
    resetCrossings();
    return;
  }
  state.width = width;
  applyMetrics();
  renderHero();
  layoutMobs();
  worlds.forEach(section => renderLayer(section, true));
  resetCrossings();
}

// Al cambiar el tamaño, los portales vuelven a medir de dónde salen.
function resetCrossings() {
  crossings.forEach(section => {
    $$('[data-base]', section).forEach(el => delete el.dataset.base);
    section.cruce.p = -1;
  });
  requestFrame();
}

function init() {
  applyMetrics();
  state.width = state.metrics.width;
  hydrate();
  setupBrand();
  buildNavigation();
  renderHero();
  worlds.forEach(section => renderLayer(section));
  worlds.forEach(section => layerObserver.observe(section));
  setupMobs();
  setupDropLogo();
  $$('button.mine[data-block]').forEach(setupMine);
  setupCrossings();
  setupCrate();
  setupPass();
  setupClanChat();
  setupEgg();
  setupCopy();
  setupTheme();
  setupSkyLife();
  setupGallery();
  setupChrome();
  observeVisibility();
  new ResizeObserver(fitFooter).observe(footer);
  footer.addEventListener('focusin', () => {
    if (!body.classList.contains('footer-reveal') || state.reveal >= 1) return;
    scrollTo({ top: document.documentElement.scrollHeight, behavior: motion() ? 'smooth' : 'auto' });
  });

  addEventListener('scroll', requestFrame, { passive: true });
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 160);
    fitFooter();
  });
  document.fonts?.ready.then(() => {
    worlds.forEach(scheduleRender);
    renderHero();
    resetCrossings();
  });
  onFrame();
  requestAnimationFrame(mobLoop);
  requestAnimationFrame(portalLoop);
  setTimeout(() => {
    state.ready = true;
  }, 700);
}

init();
