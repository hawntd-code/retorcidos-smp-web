"""Saca del jar del cliente de Minecraft (26.3, el que ya está en esta PC) las texturas que usa la página y las junta
en img/mc/atlas.png con su índice img/mc/atlas.json. pixel.js las carga al arrancar.

    python herramientas/texturas_mc.py [ruta/al/26.3.jar]

Las claves del índice:
  b:NOMBRE   bloque de 16 × 16 con el nombre que usa pixel.js (dirt, grassTop, ore:stone:coal…)
  o:NOMBRE   objeto o ícono (gem-diamond, sword-netherite, key-comun, sun…)
  c:NOMBRE   criatura de perfil, armada con su textura y las medidas de su modelo (pig-0, sheepwool-1…)
  g:N        grieta al picar (destroy_stage_N, pasada a negro y blanco con transparencia)
  p:N        cuadro N de la animación del portal del Nether

Lo único que se le hace a las texturas es lo que hace el juego: teñir el pasto, las hojas y el agua con el color de
las llanuras, poner la capa del pasto encima del costado, tomar el primer cuadro de las animadas y armar el huevo del
dragón y las criaturas con las caras de su modelo.
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
JAR = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ.parent / "Parabellum" / "base" / "versions" / "26.3" / "26.3.jar"
SALIDA = RAIZ / "img" / "mc"

PASTO = "#91bd59"     # llanuras
HOJAS = "#77ab2f"
AGUA = "#3f76e4"

jar = zipfile.ZipFile(JAR)


def tex(ruta: str) -> Image.Image:
    return Image.open(io.BytesIO(jar.read(f"assets/minecraft/textures/{ruta}.png"))).convert("RGBA")


def primer_cuadro(img: Image.Image) -> Image.Image:
    return img.crop((0, 0, img.width, img.width))


def tenir(img: Image.Image, color: str) -> Image.Image:
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            pr, pg, pb, pa = px[x, y]
            px[x, y] = (pr * r // 255, pg * g // 255, pb * b // 255, pa)
    return out


def encima(base: Image.Image, capa: Image.Image) -> Image.Image:
    out = base.copy()
    out.alpha_composite(capa)
    return out


def recorte(img: Image.Image) -> Image.Image:
    caja = img.getbbox()
    return img.crop(caja) if caja else img


# ------------------------------------------------------------------------------------------------ bloques

BLOQUES = {
    "dirt": lambda: tex("block/dirt"),
    "grass": lambda: encima(tex("block/grass_block_side"), tenir(tex("block/grass_block_side_overlay"), PASTO)),
    "grassTop": lambda: tenir(tex("block/grass_block_top"), PASTO),
    "stone": lambda: tex("block/stone"),
    "cobble": lambda: tex("block/cobblestone"),
    "gravel": lambda: tex("block/gravel"),
    "deepslate": lambda: tex("block/deepslate"),
    "bedrock": lambda: tex("block/bedrock"),
    "obsidian": lambda: tex("block/obsidian"),
    "calcite": lambda: tex("block/calcite"),
    "amethyst": lambda: tex("block/amethyst_block"),
    "basalt": lambda: tex("block/basalt_side"),
    "leaves": lambda: tenir(tex("block/oak_leaves"), HOJAS),
    "log": lambda: tex("block/oak_log"),
    "logTop": lambda: tex("block/oak_log_top"),
    "planks": lambda: tex("block/oak_planks"),
    "lava": lambda: primer_cuadro(tex("block/lava_still")),
    "water": lambda: tenir(primer_cuadro(tex("block/water_still")), AGUA),
    "ladder": lambda: tex("block/ladder"),
    "lampOff": lambda: tex("block/redstone_lamp"),
    "lampOn": lambda: tex("block/redstone_lamp_on"),
    "craftTop": lambda: tex("block/crafting_table_top"),
    "craftSide": lambda: tex("block/crafting_table_front"),
    "netherrack": lambda: tex("block/netherrack"),
    "nylium": lambda: tex("block/crimson_nylium_side"),
    "nyliumTop": lambda: tex("block/crimson_nylium"),
    "warpedNylium": lambda: tex("block/warped_nylium_side"),
    "warpedTop": lambda: tex("block/warped_nylium"),
    "soulsand": lambda: tex("block/soul_sand"),
    "blackstone": lambda: tex("block/blackstone"),
    "magma": lambda: primer_cuadro(tex("block/magma")),
    "glowstone": lambda: tex("block/glowstone"),
    "endstone": lambda: tex("block/end_stone"),
    "purpur": lambda: tex("block/purpur_block"),
    "endframeTop": lambda: tex("block/end_portal_frame_top"),
    "endframeEye": lambda: encima(tex("block/end_portal_frame_top"), tex("block/end_portal_frame_eye")),
    "stonebrick": lambda: tex("block/stone_bricks"),
    # Los que salen como premio de las cajas (en el inventario se ven como bloque).
    "ancientDebris": lambda: tex("block/ancient_debris_side"),
    "ancientDebrisTop": lambda: tex("block/ancient_debris_top"),
    "ironBlock": lambda: tex("block/iron_block"),
    "diamondBlock": lambda: tex("block/diamond_block"),
    "beacon": lambda: encima(tex("block/beacon"), tex("block/glass")),
    "shulker": lambda: tex("block/shulker_box"),
}

MENAS = {"coal": "coal", "iron": "iron", "copper": "copper", "gold": "gold", "redstone": "redstone", "lapis": "lapis",
         "diamond": "diamond", "emerald": "emerald"}
for clave, mena in MENAS.items():
    BLOQUES[f"ore:stone:{clave}"] = (lambda m: lambda: tex(f"block/{m}_ore"))(mena)
    BLOQUES[f"ore:deepslate:{clave}"] = (lambda m: lambda: tex(f"block/deepslate_{m}_ore"))(mena)
BLOQUES["ore:netherrack:quartz"] = lambda: tex("block/nether_quartz_ore")
BLOQUES["ore:netherrack:gold"] = lambda: tex("block/nether_gold_ore")

# ------------------------------------------------------------------------------------------------ objetos


def huevo_del_dragon() -> Image.Image:
    """El huevo como se ve de frente en el inventario: los cubos de su modelo, cada uno con su franja de textura."""
    modelo = json.loads(jar.read("assets/minecraft/models/block/dragon_egg.json"))
    textura = tex("block/dragon_egg")
    out = Image.new("RGBA", (16, 16))
    for el in modelo["elements"]:
        x1, y1, _ = el["from"]
        x2, y2, _ = el["to"]
        u1, v1, u2, v2 = el["faces"]["north"]["uv"]
        franja = textura.crop((int(u1), int(v1), int(u2), int(v2))).resize((int(x2 - x1), int(y2 - y1)), Image.NEAREST)
        out.alpha_composite(franja, (int(x1), int(16 - y2)))
    return recorte(out)


def orbe() -> Image.Image:
    # La hoja tiene los once tamaños en gris; el juego los tiñe de verde amarillo.
    return recorte(tenir(tex("entity/experience/experience_orb").crop((32, 0, 48, 16)), "#c8ff28"))


def grieta(n: int) -> Image.Image:
    """El juego multiplica la grieta por el bloque (×2): lo gris oscuro oscurece y lo claro aclara. Aquí va como
    negro o blanco con transparencia, que encima de cualquier bloque se ve igual, un poco más marcada (×1.6) porque
    en la página el bloque mide 64 pixeles y no hay sonido de golpe que ayude."""
    gris = Image.open(io.BytesIO(jar.read(f"assets/minecraft/textures/block/destroy_stage_{n}.png"))).convert("LA")
    out = Image.new("RGBA", gris.size)
    px, src = out.load(), gris.load()
    for y in range(gris.height):
        for x in range(gris.width):
            l, a = src[x, y]
            if l < 128:
                px[x, y] = (0, 0, 0, min(255, a * (128 - l) * 16 // 1280))
            else:
                px[x, y] = (255, 255, 255, min(255, a * (l - 128) * 16 // 1270))
    return out


def nucleo(ruta: str) -> Image.Image:
    # El sol y la luna traen un halo oscuro que el juego suma a la luz del cielo; aquí solo va el centro.
    return tex(ruta).crop((12, 12, 20, 20))


GANCHO = lambda: tex("block/tripwire_hook")   # noqa: E731  las llaves de las cajas son ganchos de cuerda

OBJETOS = {
    "gem-diamond": "item/diamond", "gem-emerald": "item/emerald", "gem-lapis": "item/lapis_lazuli",
    "gem-gold": "item/raw_gold", "gem-redstone": "item/redstone", "gem-amethyst": "item/amethyst_shard",
    "gem-quartz": "item/quartz", "lump-coal": "item/coal", "lump-iron": "item/raw_iron", "lump-copper": "item/raw_copper",
    "lump-netherite": "item/netherite_scrap", "apple-gold": "item/golden_apple", "elytra": "item/elytra",
    "chest-diamond": "item/diamond_chestplate", "steak": "item/cooked_beef", "porkchop": "item/cooked_porkchop",
    "pickaxe": "item/diamond_pickaxe", "pickaxe-netherite": "item/netherite_pickaxe",
    "sword-diamond": "item/diamond_sword", "sword-netherite": "item/netherite_sword",
    "ingot-iron": "item/iron_ingot", "ingot-gold": "item/gold_ingot", "ingot-netherite": "item/netherite_ingot",
    "heart": "gui/sprites/hud/heart/full", "torch": "block/torch", "book": "item/enchanted_book",
    "shard": "item/amethyst_shard", "bud": "block/medium_amethyst_bud", "poppy": "block/poppy",
    "dandelion": "block/dandelion", "feather": "item/feather", "eye": "item/ender_eye",
    "totem": "item/totem_of_undying", "pearl": "item/ender_pearl", "bottle": "item/experience_bottle",
    "bread": "item/bread", "arrow": "item/arrow", "tag": "item/name_tag", "rod": "item/blaze_rod",
    "carrot": "item/golden_carrot", "saddle": "item/saddle", "shell": "item/shulker_shell",
}
OBJETOS = {k: (lambda r: lambda: tex(r))(v) for k, v in OBJETOS.items()}
OBJETOS.update({
    "tuft": lambda: tenir(tex("block/short_grass"), PASTO),
    "egg": huevo_del_dragon,
    "orb": orbe,
    "sun": lambda: nucleo("environment/celestial/sun"),
    "moon": lambda: nucleo("environment/celestial/moon/full_moon"),
    "key-comun": GANCHO, "key-rara": GANCHO, "key-epica": GANCHO, "key-legendaria": GANCHO,
})

# ------------------------------------------------------------------------------------------------ criaturas
# De perfil, mirando a la derecha: se ve el costado derecho de cada cubo del modelo. En la hoja de un cubo hecho en
# (u, v) con ancho w, alto h y fondo d, ese costado está en (u, v + d) y mide d × h, con el frente a la derecha.
# Los cuerpos de cuatro patas están acostados (girados 90° en X): su costado se gira 90° a la derecha.


def costado(hoja: Image.Image, u: int, v: int, w: int, h: int, d: int) -> Image.Image:
    return hoja.crop((u, v + d, u + d, v + d + h))


def frente(hoja: Image.Image, u: int, v: int, w: int, h: int, d: int) -> Image.Image:
    return hoja.crop((u + d, v + d, u + d + w, v + d + h))


def acostado(cara: Image.Image) -> Image.Image:
    return cara.transpose(Image.Transpose.ROTATE_270)


def sombra(img: Image.Image, f: float = 0.72) -> Image.Image:
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * f), int(g * f), int(b * f), a)
    return out


def lienzo(ancho: int, alto: int) -> Image.Image:
    return Image.new("RGBA", (ancho, alto))


def patas(img, pata, x_atras, x_frente, y, cuadro):
    """Las patas del lado de acá; en el cuadro 1 dan un paso y asoman las del otro lado, más oscuras."""
    if cuadro:
        lejos = sombra(pata)
        img.alpha_composite(lejos, (x_atras + 1, y))
        img.alpha_composite(lejos, (x_frente - 1, y))
        img.alpha_composite(pata, (x_atras - 1, y))
        img.alpha_composite(pata, (x_frente + 1, y))
    else:
        img.alpha_composite(pata, (x_atras, y))
        img.alpha_composite(pata, (x_frente, y))


def cerdo(cuadro: int) -> Image.Image:
    # Modelo: cabeza 8×8×8, hocico 4×3×1, cuerpo 10×16×8 acostado, patas 4×6×4.
    # En pantalla x = −z + 10 (un pixel de orilla para el paso) y y − 8.
    hoja = tex("entity/pig/pig_temperate")
    img = lienzo(25, 16)
    patas(img, costado(hoja, 0, 16, 4, 6, 4), 1, 13, 10, cuadro)
    img.alpha_composite(acostado(costado(hoja, 28, 8, 10, 16, 8)), (2, 2))
    img.alpha_composite(costado(hoja, 0, 0, 8, 8, 8), (16, 0))
    img.alpha_composite(costado(hoja, 16, 16, 4, 3, 1), (24, 4))
    return img


def oveja(cuadro: int, lana: bool) -> Image.Image:
    # Modelo: cabeza 6×6×8, cuerpo 8×16×6 acostado, patas 4×12×4. La lana es otra capa un poco más grande
    # (1.75 en el cuerpo, 0.6 en la cabeza, 0.5 en las patas). En pantalla x = −z + 11 y y − 1.
    img = lienzo(26, 23)
    if not lana:
        hoja = tex("entity/sheep/sheep")
        patas(img, costado(hoja, 0, 16, 4, 12, 4), 2, 14, 11, cuadro)
        img.alpha_composite(acostado(costado(hoja, 28, 8, 8, 16, 6)), (3, 5))
        img.alpha_composite(costado(hoja, 0, 0, 6, 6, 8), (17, 1))
        return img
    hoja = tex("entity/sheep/sheep_wool")
    pata = costado(hoja, 0, 16, 4, 6, 4).resize((5, 7), Image.NEAREST)
    patas(img, pata, 1, 13, 10, cuadro)
    img.alpha_composite(acostado(costado(hoja, 28, 8, 8, 16, 6)).resize((20, 10), Image.NEAREST), (1, 3))
    img.alpha_composite(costado(hoja, 0, 0, 6, 6, 6).resize((7, 7), Image.NEAREST), (16, 0))
    return img


def gallina(cuadro: int) -> Image.Image:
    # Modelo: cabeza 4×6×3, pico 4×2×2, moco 2×2×2, cuerpo 6×8×6 acostado, alas 1×4×6, patas 3×5×3 (de ellas
    # solo se pinta un palito). En pantalla x = −z + 5 y y − 9.
    hoja = tex("entity/chicken/chicken_temperate")
    img = lienzo(13, 15)
    palo = hoja.crop((36, 3, 37, 8))
    dedos = palo.crop((0, 4, 1, 5)).resize((3, 1), Image.NEAREST)
    for x, lejos in (((5, False),) if not cuadro else ((4, True), (6, False))):
        img.alpha_composite(sombra(palo) if lejos else palo, (x, 10))
        img.alpha_composite(sombra(dedos) if lejos else dedos, (x, 14))
    img.alpha_composite(acostado(costado(hoja, 0, 9, 6, 8, 6)), (1, 4))
    img.alpha_composite(costado(hoja, 24, 13, 1, 4, 6), (2, 4))
    img.alpha_composite(costado(hoja, 0, 0, 4, 6, 3), (8, 0))
    img.alpha_composite(costado(hoja, 14, 4, 2, 2, 2), (10, 4))
    img.alpha_composite(costado(hoja, 14, 0, 4, 2, 2), (11, 2))
    return img


def creeper() -> Image.Image:
    # De frente: cabeza 8×8×8, cuerpo 8×12×4 y las dos patas de adelante, 4×6×4.
    hoja = tex("entity/creeper/creeper")
    img = lienzo(8, 26)
    pata = frente(hoja, 0, 16, 4, 6, 4)
    img.alpha_composite(pata, (0, 20))
    img.alpha_composite(pata, (4, 20))
    img.alpha_composite(frente(hoja, 16, 16, 8, 12, 4), (0, 8))
    img.alpha_composite(frente(hoja, 0, 0, 8, 8, 8), (0, 0))
    return img


CRIATURAS = {
    "pig-0": lambda: cerdo(0), "pig-1": lambda: cerdo(1),
    "sheep-0": lambda: oveja(0, False), "sheep-1": lambda: oveja(1, False),
    "sheepwool-0": lambda: oveja(0, True), "sheepwool-1": lambda: oveja(1, True),
    "chicken-0": lambda: gallina(0), "chicken-1": lambda: gallina(1),
    "creeper": creeper,
}

# ------------------------------------------------------------------------------------------------ el atlas


def main():
    piezas: dict[str, Image.Image] = {}
    for nombre, hacer in BLOQUES.items():
        piezas[f"b:{nombre}"] = hacer()
    for nombre, hacer in OBJETOS.items():
        piezas[f"o:{nombre}"] = hacer()
    for nombre, hacer in CRIATURAS.items():
        piezas[f"c:{nombre}"] = hacer()
    for n in range(10):
        piezas[f"g:{n}"] = grieta(n)
    portal = tex("block/nether_portal")
    for n in range(portal.height // 16):
        piezas[f"p:{n}"] = portal.crop((0, n * 16, 16, n * 16 + 16))

    # Las piezas iguales (las cuatro llaves) comparten lugar. Se acomodan en renglones de 512 px.
    lugares: dict[bytes, list[int]] = {}
    indice: dict[str, list[int]] = {}
    ancho, x, y, alto_renglon = 512, 0, 0, 0
    orden = sorted(piezas.items(), key=lambda kv: (-kv[1].height, kv[0]))
    for clave, img in orden:
        firma = img.tobytes() + bytes(img.size)
        if firma not in lugares:
            if x + img.width > ancho:
                x, y, alto_renglon = 0, y + alto_renglon, 0
            lugares[firma] = [x, y, img.width, img.height]
            x += img.width
            alto_renglon = max(alto_renglon, img.height)
        indice[clave] = lugares[firma]
    atlas = Image.new("RGBA", (ancho, y + alto_renglon))
    for clave, img in piezas.items():
        px, py, _, _ = indice[clave]
        atlas.paste(img, (px, py))

    SALIDA.mkdir(parents=True, exist_ok=True)
    atlas.save(SALIDA / "atlas.png", optimize=True)
    (SALIDA / "atlas.json").write_text(json.dumps(dict(sorted(indice.items())), separators=(",", ":")), "utf-8")
    print(f"{len(piezas)} piezas, atlas de {atlas.width} × {atlas.height}, {(SALIDA / 'atlas.png').stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
