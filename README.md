# Retorcidos SMP · web

La página del servidor Retorcidos SMP (survival de Minecraft para Java y Bedrock). Es un corte del mundo: se baja
desde la superficie del Overworld, se cruza el portal al Nether, se vuelve al portal del End del spawn y se
cae al vacío, donde está el pie.

- `index.html`: toda la página, capa por capa (reglas, spawn, clanes, portal al Nether, llaves y cajas, Filo X,
  portal al End, el pase, el día 60 y cómo entrar).
- `js/pixel.js`: el pixel art. Bloques, minerales, objetos y criaturas usan las texturas del juego
  (`img/mc/atlas.png`); con ellas arma los mundos de cada capa. Lo que no existe en el juego (la marca, el título,
  el minero, las caras) se dibuja con código, y esos dibujos quedan de respaldo si el atlas no carga.
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

## Las texturas del juego

`img/mc/atlas.png` y `img/mc/atlas.json` salen del jar del cliente 26.3 que ya está en la PC:

```
python herramientas/texturas_mc.py [ruta/al/26.3.jar]
```

Sin ruta busca `../Parabellum/base/versions/26.3/26.3.jar`. Solo hace lo que hace el juego: tiñe pasto, hojas y
agua con el color de las llanuras, toma el primer cuadro de las animadas y arma el huevo del dragón y las criaturas
de perfil con las caras de su modelo. `herramientas/` no se publica (`.vercelignore`).

Las pautas de uso de Mojang (minecraft.net/usage-guidelines) dejan usar sus texturas en la web de un server con
condiciones: que no parezca oficial (el aviso del pie), sin sus logos y sin usar sus texturas como logo propio. Por
eso la marca del encabezado, el pie, el ícono y el título siguen con dibujo propio (`own:` en `pixel.js`).
