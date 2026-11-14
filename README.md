# IG

# Un día en BIXI Montréal

Visualización en three.js de los viajes de un día del sistema de bicis compartidas BIXI (Montreal) sobre un mapa de la ciudad. Cada viaje es un arco animado entre su estación de origen (ámbar) y la de destino (cian).

**Vídeo:** https://drive.google.com/file/d/1DiADsdj09IuDfluAWkRC5oM2i9KK_Yk9/view?usp=sharing

## Qué incluye

- **Modo Actividad:** las estaciones se iluminan según sus viajes recientes.
- **Modo Balance de bicis:** colorea cada estación según las bicis que recibe menos las que pierde.
- **Ranking en vivo** de estaciones y **leyenda** explicativa.
- **Línea de tiempo** con el gráfico de viajes por hora: haz clic para saltar a cualquier momento.
- Clic en una estación para ver sus salidas, llegadas y balance.

## Datos

Datos abiertos de BIXI Montréal, 15-02-2026. El archivo original es muy grande, así que `preparar.py` extrae un solo día y genera `viajes.json`.

## Cómo ejecutarlo

Abre la carpeta en VS Code y arranca **Live Server** sobre `index.html`. El mapa usa una clave gratuita de CARTO definida en `main.js`.

## Créditos

Mapa: © OpenStreetMap contributors, © CARTO.

Carmelo Romero Pérez
