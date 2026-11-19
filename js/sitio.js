/* Retorcidos SMP · web
   - Copiar las direcciones del server.
   - Cruzar entre dimensiones: al final de una página, si sigues bajando, se llena una barra y cruzas a la siguiente
     (y al principio, si sigues subiendo, regresas a la anterior). La lógica del «gesto en el borde» viene de la web
     anterior de RETORCIDOS (BoundaryGate); la cortina nueva llena la pantalla con el color de la dimensión destino.
   - Los enlaces a otra dimensión (arriba y al final) cruzan igual. Sin JavaScript son enlaces normales. */
(() => {
  'use strict';
  const MUNDOS = ['overworld', 'nether', 'end'];
  const ARCHIVOS = ['index.html', 'nether.html', 'end.html'];
  const NOMBRES = ['Overworld', 'Nether', 'End'];
  const IDS = ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'];
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

  // ------------------------------------------------------------ avisos y copiar
  const aviso = document.querySelector('.aviso');
  let avisoT;
  function avisar(texto) {
    aviso.textContent = texto;
    aviso.classList.add('visible');
    clearTimeout(avisoT);
    avisoT = setTimeout(() => aviso.classList.remove('visible'), 2600);
  }
  document.addEventListener('click', async (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-copiar]');
    if (!b) return;
    const valor = b.dataset.copiar;
    try {
      await navigator.clipboard.writeText(valor);
      b.dataset.listo = '';
      b.textContent = 'Copiado';
      avisar(`Copiado: ${valor}`);
      setTimeout(() => { delete b.dataset.listo; b.textContent = 'Copiar'; }, 2200);
    } catch {
      avisar(`Cópialo a mano: ${valor}`);
    }
  });

  // ------------------------------------------------------------ barra superior sólida al bajar
  const barra = document.querySelector('.barra');
  const pintarBarra = () => barra.classList.toggle('solida', scrollY > 24);
  addEventListener('scroll', pintarBarra, { passive: true });
  pintarBarra();

  // ------------------------------------------------------------ gesto en el borde (de la web anterior)
  class Compuerta {
    constructor() { this.bloqueoHasta = 0; this.gestoBloqueado = null; this.reiniciar(); }
    reiniciar() { this.avance = 0; this.direccion = 0; this.inicio = null; this.ultimo = 0; }
    suspender(ahora, gesto) { this.reiniciar(); this.bloqueoHasta = ahora + 1100; this.gestoBloqueado = gesto; }
    alimentar(delta, { ahora, borde, gesto, permitido = true }) {
      if (!permitido || !borde || Math.sign(delta) !== borde || Math.abs(delta) < 0.5) { this.reiniciar(); return 0; }
      if (ahora < this.bloqueoHasta) { this.gestoBloqueado = gesto; this.reiniciar(); return 0; }
      if (gesto === this.gestoBloqueado) return 0;
      if (this.direccion !== borde || ahora - this.ultimo > 1600) this.reiniciar();
      this.direccion = borde;
      this.inicio ??= ahora;
      this.ultimo = ahora;
      this.avance = Math.min(1, this.avance + Math.min(Math.abs(delta), 75) / 190);
      if (this.avance >= 1 && ahora - this.inicio >= 140) { this.suspender(ahora, gesto); return borde; }
      return 0;
    }
  }

  const compuerta = new Compuerta();
  const portal = document.querySelector('.portal');
  const avisoCruce = document.querySelector('.aviso-cruce');
  const paginas = new Map();
  let ocupado = false, ultimoGesto, serie = 0, cuadro = 0, inactivo;
  history.scrollRestoration = 'manual';

  const indice = () => MUNDOS.indexOf(document.body.dataset.world);
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  function borde() {
    if (maxScroll() < 80) return 0;
    if (scrollY <= 8 && indice() > 0) return -1;
    if (maxScroll() - scrollY <= 12 && indice() < 2) return 1;
    return 0;
  }

  function pintar() {
    if (cuadro) return;
    cuadro = requestAnimationFrame(() => {
      cuadro = 0;
      const b = borde();
      if (!b) compuerta.reiniciar();
      const avance = ocupado ? 0 : compuerta.avance;
      const barraCruce = document.querySelector('.cruce-barra');
      if (barraCruce) barraCruce.style.setProperty('--avance', b > 0 ? avance : 0);
      avisoCruce.hidden = !b || !avance;
      if (!avisoCruce.hidden) {
        avisoCruce.querySelector('span').textContent = b > 0
          ? `Sigue bajando: cruzas al ${NOMBRES[indice() + 1]}`
          : `Sigue subiendo: regresas al ${NOMBRES[indice() - 1]}`;
        avisoCruce.style.setProperty('--avance', avance);
      }
      // Precarga la siguiente dimensión cuando ya estás cerca del final.
      if (indice() < 2 && maxScroll() - scrollY < 1400) cargar(new URL(ARCHIVOS[indice() + 1], location.href)).catch(() => {});
    });
  }

  function cargar(url) {
    const clave = url.origin + url.pathname;
    if (!paginas.has(clave)) {
      const p = fetch(clave).then(async (r) => {
        if (!r.ok) throw new Error('No se pudo abrir la dimensión');
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        if (!doc.querySelector('main') || !MUNDOS.includes(doc.body.dataset.world)) throw new Error('Página incompleta');
        const img = doc.querySelector('main img');
        if (img) { const i = new Image(); i.srcset = img.getAttribute('srcset') || ''; i.src = new URL(img.getAttribute('src'), url).href; }
        return doc;
      }).catch((err) => { paginas.delete(clave); throw err; });
      paginas.set(clave, p);
    }
    return paginas.get(clave);
  }

  // Espera la animación, pero nunca más de lo que dura (+250 ms): en una pestaña de fondo el navegador las pausa y el
  // cruce no debe quedarse a medias.
  function animar(el, cuadros, opciones) {
    if (quieto.matches || document.hidden) return Promise.resolve();
    const a = el.animate(cuadros, { fill: 'forwards', ...opciones });
    const tope = new Promise((r) => setTimeout(r, (opciones.duration || 0) + 250));
    return Promise.race([a.finished.catch(() => {}), tope]);
  }

  async function cruzar(url, direccion = 1, guardar = true) {
    if (ocupado) return;
    ocupado = true;
    compuerta.suspender(performance.now(), ultimoGesto);
    pintar();
    const ruta = url.pathname;
    const destino = ruta.endsWith('nether.html') ? 'nether' : ruta.endsWith('end.html') ? 'end' : 'overworld';
    const i = MUNDOS.indexOf(destino);
    const carga = cargar(url);
    carga.catch(() => {});
    try {
      portal.dataset.destino = destino;
      portal.querySelector('strong').textContent = NOMBRES[i];
      portal.querySelector('span').textContent = IDS[i];
      portal.hidden = false;
      const desde = direccion > 0 ? '50% 100%' : '50% 0%';
      await animar(portal, [{ clipPath: `circle(0% at ${desde})` }, { clipPath: `circle(150% at ${desde})` }],
        { duration: 720, easing: 'cubic-bezier(0.7, 0, 0.84, 0)' });
      const doc = await carga;
      document.querySelector('main').replaceWith(document.importNode(doc.querySelector('main'), true));
      document.body.dataset.world = destino;
      document.title = doc.title;
      document.querySelector('meta[name="theme-color"]').content = doc.querySelector('meta[name="theme-color"]').content;
      document.querySelectorAll('.mundos a').forEach((a, k) => {
        if (k === i) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      if (guardar) history.pushState({ mundo: destino }, '', url.href);
      scrollTo({ top: direccion > 0 || !Number.isFinite(direccion) ? 0 : maxScroll(), behavior: 'instant' });
      pintarBarra();
      document.querySelector('main').focus({ preventScroll: true });
      const hacia = direccion > 0 ? '50% 0%' : '50% 100%';
      await animar(portal, [{ clipPath: `circle(150% at ${hacia})` }, { clipPath: `circle(0% at ${hacia})` }],
        { duration: 560, easing: EASE });
    } catch {
      if (!guardar) { location.reload(); return; }
      avisar('No se pudo abrir la dimensión. Inténtalo otra vez.');
    } finally {
      portal.hidden = true;
      portal.getAnimations().forEach((a) => a.cancel());
      ocupado = false;
      compuerta.suspender(performance.now(), ultimoGesto);
      pintar();
    }
  }

  function alimentar(delta, gesto, objetivo) {
    ultimoGesto = gesto;
    const anidado = objetivo instanceof Element && objetivo.closest('input, textarea, select, [contenteditable="true"]');
    const dir = compuerta.alimentar(delta, { ahora: performance.now(), borde: borde(), gesto, permitido: !ocupado && !document.hidden && !anidado });
    clearTimeout(inactivo);
    inactivo = setTimeout(() => { compuerta.reiniciar(); pintar(); }, 1600);
    pintar();
    if (dir) cruzar(new URL(ARCHIVOS[indice() + dir], location.href), dir);
  }

  let ruedaEn = -Infinity, gestoRueda;
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const ahora = performance.now();
    if (ahora - ruedaEn > 240) gestoRueda = 'rueda-' + ++serie;
    ruedaEn = ahora;
    alimentar(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1), gestoRueda, e.target);
  }, { passive: true });

  let toque;
  addEventListener('touchstart', (e) => {
    toque = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, gesto: 'toque-' + ++serie } : null;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!toque || e.touches.length !== 1) { toque = null; return; }
    const p = e.touches[0], dy = toque.y - p.clientY, dx = toque.x - p.clientX;
    toque.x = p.clientX; toque.y = p.clientY;
    if (Math.abs(dy) > Math.abs(dx)) alimentar(dy * 1.4, toque.gesto, e.target);
  }, { passive: true });
  ['touchend', 'touchcancel'].forEach((t) => addEventListener(t, () => { toque = null; }, { passive: true }));

  let gestoTecla;
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, button, a, [contenteditable="true"]') && e.code === 'Space') return;
    const d = ['ArrowDown', 'PageDown', 'End', 'Space'].includes(e.code) ? (e.code === 'Space' && e.shiftKey ? -1 : 1)
      : ['ArrowUp', 'PageUp', 'Home'].includes(e.code) ? -1 : 0;
    if (!d) return;
    if (!e.repeat) gestoTecla = 'tecla-' + ++serie;
    alimentar(d * 75, gestoTecla, e.target);
  });

  // Enlaces a otra dimensión (barra de arriba y «Cruzar al…»): cruzan con la cortina.
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[data-mundo]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const destino = MUNDOS.indexOf(a.dataset.mundo);
    if (destino === indice()) { e.preventDefault(); scrollTo({ top: 0, behavior: quieto.matches ? 'instant' : 'smooth' }); return; }
    e.preventDefault();
    cruzar(new URL(a.getAttribute('href'), location.href), destino > indice() ? 1 : -1);
  });

  addEventListener('scroll', pintar, { passive: true });
  addEventListener('resize', () => { compuerta.reiniciar(); pintar(); }, { passive: true });
  addEventListener('popstate', () => {
    const r = location.pathname;
    const destino = r.endsWith('nether.html') ? 'nether' : r.endsWith('end.html') ? 'end' : 'overworld';
    if (destino === document.body.dataset.world) return;
    cruzar(new URL(location.href), MUNDOS.indexOf(destino) < indice() ? -1 : 1, false);
  });
  addEventListener('pageshow', () => { portal.hidden = true; ocupado = false; pintar(); });
  history.replaceState({ mundo: document.body.dataset.world }, '', location.href);
  pintar();
})();
