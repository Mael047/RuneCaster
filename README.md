# RUNECASTER

Videojuego web para un jugador: defiende la torre dibujando runas en el aire con una varita física frente a la webcam.

Proyecto del curso *Movimiento e Interacción* · Isabella Gallego, Katalina Daza, Joan Moreno, Santiago Peñalosa, Laura Cerón.

## Cómo correrlo en tu computador

El navegador no deja cargar módulos de JavaScript abriendo el `index.html` con doble clic, así que hay que usar un servidor local. Cualquiera de estas opciones sirve:

- **VS Code:** instala la extensión *Live Server*, haz clic derecho en `index.html` y elige **Open with Live Server**.
- **Python:** en la carpeta del proyecto, ejecuta `python -m http.server 8000` y abre http://localhost:8000

No hay que instalar Three.js: se carga desde internet (mira el `importmap` en `index.html`).

## Controles (provisionales)

Mientras no exista el seguimiento de la varita, las runas se simulan con el teclado:

| Tecla | Runa |
|---|---|
| 1 | Círculo |
| 2 | Línea |
| 3 | Triángulo |

## Estructura

```
index.html     página, interfaz (HUD) e importmap de Three.js
src/main.js    escena 3D, torre, enemigos, hechizos y bucle del juego
```

Próximos módulos (según el cronograma):

- `src/tracking.js`: webcam y seguimiento por color de la varita (Joan)
- `src/runas.js`: $1 Unistroke Recognizer (Santiago)
- `src/juego.js`: oleadas, dificultad y tutorial (Isabella)

## Publicar

GitHub Pages sirve el sitio con HTTPS, que el navegador exige para usar la cámara. Para activarlo: **Settings → Pages → Deploy from branch → main / root**.
