# Retorcidos SMP · web

La página del servidor Retorcidos SMP (survival de Minecraft para Java y Bedrock). Es un corte del mundo: se baja
desde la superficie del Overworld, se cruza el portal al Nether, se pasa por la fortaleza al portal del End y se
cae al vacío, donde está el pie.

- `index.html`: toda la página, capa por capa (reglas, spawn, clanes, portal al Nether, llaves y cajas, Filo X,
  portal al End, el pase, el día 60 y cómo entrar).
- `js/pixel.js`: todo el pixel art se dibuja con código (bloques, minerales, criaturas, objetos y los mundos de
  cada capa). No hay imágenes de texturas.
- `js/viaje.js`: lo que se mueve. Las capas, el HUD (F3, experiencia y barra rápida), el minero en la escalera,
  los minerales que se pican, los dos cruces de portal, la caja de prueba, el pase y el pie que se descubre.
- `css/sitio.css`: estilos.

El motor sale del prototipo «Excavación» que se hizo para la web de Parabellum.

## Datos que salen del server

La caja de prueba usa los mismos premios y pesos que `cajas.yml` del plugin, y el pase los de `pase.yml`. Si se
cambian allá, hay que cambiarlos en `js/viaje.js` (`CAJAS` y `PASE`).

HTML, CSS y JavaScript sin compilar: no hay que instalar nada. Las fuentes (Bungee, Inter y VT323) vienen de Google
Fonts.

## Verla en tu PC

```
python -m http.server 8770
```

y abre http://127.0.0.1:8770/ (los módulos de JavaScript no cargan abriendo el archivo directo).

## Publicar

Está conectada a Vercel: cada cambio que se sube a `main` se publica solo.

## Las imágenes

Son capturas reales del spawn («Village & Palace», de MRVLAD70) y del Nether con los shaders Complementary
Reimagined, en `img/` en tres anchos (768, 1280 y 1920) y en WebP.
