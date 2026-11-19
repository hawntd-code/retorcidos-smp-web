# Retorcidos SMP · web

La página del servidor Retorcidos SMP (survival de Minecraft para Java y Bedrock): tres páginas, una por dimensión,
y al final de cada una, si sigues bajando, cruzas a la siguiente.

- `index.html`: Overworld. Qué es el server, cómo entrar, cómo se juega y el spawn.
- `nether.html`: clanes, llaves y cajas, encantamientos.
- `end.html`: el pase de 60 días, Parabellum y cómo entrar.

HTML, CSS y JavaScript sin compilar: no hay que instalar nada. Las fuentes vienen de Google Fonts.

## Verla en tu PC

```
python -m http.server 8770
```

y abre http://127.0.0.1:8770/ (el cruce entre dimensiones necesita servidor, no funciona abriendo el archivo).

## Publicar

Está conectada a Vercel: cada cambio que se sube a `main` se publica solo.

## Las imágenes

Son capturas reales del spawn («Village & Palace», de MRVLAD70) con los shaders Complementary Reimagined, en
`img/` en tres anchos (768, 1280 y 1920) y en WebP.
