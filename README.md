# RUNCASTER

Videojuego web para un jugador: defiende la torre dibujando runas en el aire con una varita física frente a la webcam.

Proyecto del curso *Movimiento e Interacción* · Isabella Gallego, Katalina Daza, Joan Moreno, Santiago Peñalosa, Laura Cerón.

## Cómo correrlo en tu computador

El navegador no deja cargar módulos de JavaScript abriendo el `index.html` con doble clic, así que hay que usar un servidor local. Cualquiera de estas opciones sirve:

- **VS Code:** instala la extensión *Live Server*, haz clic derecho en `index.html` y elige **Open with Live Server**.
- **Python:** en la carpeta del proyecto, ejecuta `python -m http.server 8000` y abre http://localhost:8000

No hay que instalar Three.js: se carga desde internet (mira el `importmap` en `index.html`).

## Cómo se juega

Al abrir `index.html` se elige jugar con la cámara (mano) o con el mouse. Los enemigos avanzan por oleadas hacia la torre, y cada uno se vence con la runa que tiene su misma forma:

| Enemigo | Forma | Runa | Comportamiento |
|---|---|---|---|
| Orbe | esfera azul | ◯ círculo | velocidad normal, rebota |
| Lanza | barra amarilla | ─ línea | la más rápida |
| Pico | pirámide rosada | △ triángulo | lenta, pero hace el doble de daño |

- La runa lanza un hechizo al enemigo **más cercano de ese tipo** (lock-on automático).
- Las oleadas 1, 2 y 3 presentan un enemigo nuevo cada una y sirven de tutorial. Desde la 4 aparecen los tres tipos mezclados y cada vez más rápidos.
- Si no hay enemigos del tipo de la runa, el juego avisa ("No hay Lanzas en el camino"). Si la runa no se reconoce, sale un aviso amable y no pasa nada más.
- Teclas de prueba: `1` = ◯, `2` = ─, `3` = △.
- En la consola del navegador (F12): `runcaster.iniciarOleada(3)` salta a la oleada 3, y `runcaster.juego.vida = 1000` deja la torre casi inmortal.

## Estructura

```
index.html                  juego: página, interfaz (HUD), pantallas de inicio y fin
src/main.js                 juego: oleadas, hechizos, entrada (cámara/mouse/teclado), rastro
src/escena.js               mundo 3D: cámara, luces, suelo, torre, decorado y partículas
src/enemigos.js             los 3 tipos de enemigo (forma, color, velocidad, animación)
prueba-seguimiento.html     página de prueba del seguimiento (hipótesis H1)
src/tracking.js             webcam + detección del punto (modo mano o modo color)
src/prueba-seguimiento.js   lógica de la página de prueba: rastro y estadísticas
prueba-runas.html           página de prueba del reconocimiento (hipótesis H2)
src/runas.js                reconocedor $1 + segmentador de trazos
src/prueba-runas.js         lógica de la página de prueba: registro de aciertos
```

## Seguimiento (`src/tracking.js`)

Tiene dos modos, con la misma salida: un punto `{ x, y }` entre 0 y 1 (en espejo), o `null` si no ve nada.

- **Mano** (activo por ahora): MediaPipe Hands detecta la mano y usa la punta del dedo índice. Sirve mientras no exista la varita, y queda como plan B.
- **Color** (para la varita): busca los píxeles del color de la bolita fluorescente. En la página de prueba, haz clic sobre la bolita en el video para elegir el color.

Para probarlo, abre `prueba-seguimiento.html` con Live Server y da permiso a la cámara. El panel muestra en qué porcentaje de cuadros se detecta el punto y a cuántos cuadros por segundo va. Son los datos que hay que anotar en la prueba H1 para cada condición de luz.

La primera vez, el modo mano tarda unos segundos porque descarga el modelo.

## Runas (`src/runas.js`)

- **Círculo y triángulo:** se reconocen con el $1 Unistroke Recognizer, comparando el trazo con plantillas generadas por código (ambos sentidos de giro y varios puntos de inicio).
- **Línea:** se reconoce aparte, midiendo qué tan delgado es el trazo, porque $1 no funciona bien con líneas.
- **Rechazo:** si el trazo no se parece lo suficiente a ninguna runa (puntaje menor que `AJUSTES.puntajeMinimo`), se rechaza con un mensaje amable. Un cuadrado se rechaza a propósito para que no dispare un círculo.
- **Inicio y fin de la runa en el aire** (`SegmentadorTrazos`): la runa empieza cuando el punto se mueve. Termina con la primera de estas señales:
  - **Cierre:** en el círculo y el triángulo, cuando la mano vuelve al punto de inicio.
  - **Pausa:** la mano se queda quieta unos 280 ms dentro de un radio pequeño. Se mide con un radio y no con la velocidad, porque la detección tiembla y la velocidad nunca llega a cero.
  - **Se pierde:** el punto desaparece. En ese caso se descartan los últimos 150 ms, que suelen ser el movimiento de salida de la cámara.
- **Temblor** (`src/filtro.js`): el punto pasa por un filtro *One Euro*, que suaviza mucho cuando la mano va lenta y poco cuando va rápida. Así se quita el temblor sin que el trazo se atrase.

En una prueba con 900 trazos sintéticos (con temblor, rotación y deformación), acertó en 99,9% de los casos y rechazó todos los trazos que no eran runas. Esto hay que confirmarlo con personas en la prueba H2.

Para hacer la prueba H2, abre `prueba-runas.html`. Se puede usar con la cámara o con el mouse. Escribe el nombre del participante, elige la runa que le pides dibujar y la página va contando aciertos por runa. Con "Copiar resultados" se copian todos los intentos para pegarlos en una hoja de cálculo.

Pendiente (semana 5): reemplazar las formas básicas por modelos 3D (en `escena.js` y en `crearMalla()` de `enemigos.js`), agregar sonidos y pulir la interfaz.

## Publicar

GitHub Pages sirve el sitio con HTTPS, que el navegador exige para usar la cámara. Para activarlo: **Settings → Pages → Deploy from branch → main / root**.
