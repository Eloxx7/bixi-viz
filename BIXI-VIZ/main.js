import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";

// ================= Ajustes que puedes tocar =================
const CARTO_KEY = "cb1_588r_1_20e1af17d8ba8b8657815576";
const ESTILO = "dark_all";        // mapa oscuro de CARTO
const ZONA = "America/Toronto";   // hora de Montreal
const ANCHO = 12;                 // tamaño del mapa en la escena
const TILE = 256;                 // píxeles por tesela
const MAX_TESELAS = 8;            // teselas por lado (más = más nítido, más descarga)
const TAM_ESTACION = 0.16;        // tamaño base del brillo de cada estación
const COLOR_ORIGEN = new THREE.Color(0xffb347);   // ámbar: de dónde sale el viaje
const COLOR_DESTINO = new THREE.Color(0x46d9ff);  // cian: adónde llega
const COLOR_FRIA = new THREE.Color(0x2f8fb8);     // estación tranquila
const COLOR_CALIDA = new THREE.Color(0xffb347);   // estación muy activa
const COLOR_NEUTRA = new THREE.Color(0x4a5d7a);   // estación equilibrada (modo balance)
const BRILLO_ESTACION = 0.7;      // 0 a 1: intensidad de las luces de las estaciones
const FILAS_RANKING = 6;          // filas del ranking
// ============================================================

const $ = (id) => document.getElementById(id);
const el = {
  escena: $("escena"), hora: $("hora"), fecha: $("fecha"),
  curso: $("n-curso"), total: $("n-total"), play: $("play"),
  hist: $("hist"), tarjeta: $("tarjeta"), tNombre: $("t-nombre"), tDatos: $("t-datos"),
  bAct: $("modo-actividad"), bBal: $("modo-balance"),
  lateral: $("lateral"), rLista: $("r-lista"), rTitulo: $("r-titulo"),
};
const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Escena, cámara y controles ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 200);
camera.up.set(0, 0, 1);                       // el mapa está en el plano XY
const camFinal = new THREE.Vector3(0, -9.5, 8.5);
const camInicio = new THREE.Vector3(0, -3, 17);
camera.position.copy(reducido ? camFinal : camInicio);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
el.escena.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.47;      // no deja pasar por debajo del mapa
controls.minDistance = 3;
controls.maxDistance = 30;
controls.autoRotateSpeed = 0.35;

// ---------- Texturas y materiales compartidos ----------
function crearBrillo() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.22)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const texBrillo = crearBrillo();
const matCabeza = new THREE.SpriteMaterial({
  map: texBrillo, color: 0xbff3ff, transparent: true,
  depthWrite: false, blending: THREE.AdditiveBlending,
});

// ---------- Estado ----------
const estado = { reproducir: true, velocidad: 1500, maxArcos: 350, mostrarArcos: true, girar: !reducido, modo: "actividad" };
const opacidadArco = () => (estado.modo === "balance" ? 0.4 : 0.95);
let data = null, tiempo = 0, siguiente = 0, activos = [], sel = -1;
let intro = reducido ? 1 : 0;
let bins = [], maxBin = 1, escalaBalance = 4;
const estaciones = [];
const NPTS = 40;   // puntos por arco

// ---------- Mapa base (teselas) ----------
function lonToX(lon, z) { return (lon + 180) / 360 * 2 ** z; }
function latToY(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z;
}

// Prueba dos formas de la URL de CARTO por si una no existe para este estilo
function urlsTesela(z, x, y) {
  const k = `?key=${CARTO_KEY}`;
  return [
    `https://basemaps.cartocdn.com/rastertiles/${ESTILO}/${z}/${x}/${y}.png${k}`,
    `https://basemaps.cartocdn.com/${ESTILO}/${z}/${x}/${y}.png${k}`,
  ];
}
function cargarImagen(urls, alCargar) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  let i = 0;
  img.onload = () => alCargar(img);
  img.onerror = () => { if (++i < urls.length) img.src = urls[i]; };
  img.src = urls[0];
}

function cargarTeselas(base, z, x0, y0, nx, ny) {
  const canvas = document.createElement("canvas");
  canvas.width = nx * TILE;
  canvas.height = ny * TILE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0e1420";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  base.material.color.set(0xffffff);
  base.material.map = tex;
  base.material.needsUpdate = true;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      cargarImagen(urlsTesela(z, x0 + i, y0 + j), (img) => {
        ctx.drawImage(img, i * TILE, j * TILE, TILE, TILE);
        tex.needsUpdate = true;
      });
    }
  }
}

// ---------- Carga de datos ----------
fetch("./viajes.json")
  .then((r) => {
    if (!r.ok) throw new Error("No se encuentra viajes.json (" + r.status + ")");
    return r.json();
  })
  .then(iniciar)
  .catch((err) => {
    el.fecha.textContent = "No se pudo cargar: " + err.message;
    console.error(err);
  });

function iniciar(d) {
  data = d;
  const lats = d.stations.map((s) => s.lat), lons = d.stations.map((s) => s.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
  const mLat = (latMax - latMin) * 0.1, mLon = (lonMax - lonMin) * 0.1;

  // Mayor zoom que cabe en MAX_TESELAS x MAX_TESELAS
  let z = 17, x0, x1, y0, y1;
  for (; z > 8; z--) {
    x0 = Math.floor(lonToX(lonMin - mLon, z));
    x1 = Math.floor(lonToX(lonMax + mLon, z));
    y0 = Math.floor(latToY(latMax + mLat, z));
    y1 = Math.floor(latToY(latMin - mLat, z));
    if (x1 - x0 + 1 <= MAX_TESELAS && y1 - y0 + 1 <= MAX_TESELAS) break;
  }
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const cx = x0 + nx / 2, cy = y0 + ny / 2;
  const esc = ANCHO / Math.max(nx, ny);

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(nx * esc, ny * esc),
    new THREE.MeshBasicMaterial({ color: 0x0e1420 })
  );
  scene.add(base);
  cargarTeselas(base, z, x0, y0, nx, ny);

  // Estaciones: un brillo suave en cada una
  d.stations.forEach((s, i) => {
    const pos = new THREE.Vector3((lonToX(s.lon, z) - cx) * esc, -(latToY(s.lat, z) - cy) * esc, 0.03);
    const mat = new THREE.SpriteMaterial({
      map: texBrillo, color: COLOR_FRIA.clone(), transparent: true,
      opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.setScalar(TAM_ESTACION);
    scene.add(sprite);
    estaciones.push({ nombre: s.n, pos, sprite, actividad: 0, salidas: 0, llegadas: 0 });
  });

  // Viajes por media hora, para el gráfico inferior
  bins = new Array(48).fill(0);
  d.trips.forEach((t) => {
    const b = Math.min(47, Math.max(0, Math.floor((t[0] - d.dayStart) / 1800000)));
    bins[b]++;
  });
  maxBin = Math.max(...bins, 1);
  escalaBalance = calcularEscalaBalance(d);

  const f = new Date(d.dayStart + 12 * 3600000).toLocaleDateString("es-ES", {
    timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  el.fecha.textContent = f.charAt(0).toUpperCase() + f.slice(1);

  ajustarHist();
  saltarA(0);
  crearGUI();
  clock.getDelta();   // descarta el tiempo que tardó en cargar
  animar();
}

// Cuántas bicis de desequilibrio se considera "mucho" (para la escala de color)
function calcularEscalaBalance(d) {
  const ev = [];
  d.trips.forEach(([ini, fin, o, dd]) => {
    if (o !== dd) { ev.push([ini, o, -1]); ev.push([fin, dd, 1]); }
  });
  ev.sort((a, b) => a[0] - b[0]);
  const b = new Array(d.stations.length).fill(0), mx = new Array(d.stations.length).fill(0);
  for (const [, i, s] of ev) {
    b[i] += s;
    if (Math.abs(b[i]) > mx[i]) mx[i] = Math.abs(b[i]);
  }
  const v = mx.filter((x) => x > 0).sort((a, c) => a - c);
  return Math.max(4, v.length ? v[Math.floor(v.length * 0.85)] : 4);
}

// ---------- Tiempo ----------
function saltarA(horas) {
  tiempo = data.dayStart + horas * 3600000;
  activos.forEach(quitarArco);
  activos = [];
  estaciones.forEach((e) => { e.actividad = 0; e.salidas = 0; e.llegadas = 0; });

  siguiente = data.trips.findIndex((t) => t[0] >= tiempo);
  if (siguiente < 0) siguiente = data.trips.length;

  // Recupera lo ocurrido antes de ese momento: contadores y viajes aún en marcha
  for (let i = 0; i < siguiente; i++) {
    const [ini, fin, o, d] = data.trips[i];
    estaciones[o].salidas++;
    if (fin <= tiempo) estaciones[d].llegadas++;
    else if (o !== d && estado.mostrarArcos && activos.length < estado.maxArcos) {
      activos.push({ ini, fin, d, llego: false, tFin: 0, ...crearArco(estaciones[o].pos, estaciones[d].pos) });
    }
  }
}

// ---------- Arcos ----------
function crearArco(A, B) {
  const medio = A.clone().add(B).multiplyScalar(0.5);
  medio.z += Math.max(A.distanceTo(B) * 0.45, 0.15);
  const curva = new THREE.QuadraticBezierCurve3(A, medio, B);
  const puntos = curva.getPoints(NPTS - 1);

  const pos = new Float32Array(NPTS * 3), col = new Float32Array(NPTS * 3);
  const c = new THREE.Color();
  puntos.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    c.copy(COLOR_ORIGEN).lerp(COLOR_DESTINO, i / (NPTS - 1));
    col.set([c.r, c.g, c.b], i * 3);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, 2);
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: opacidadArco(),
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const linea = new THREE.Line(geo, mat);
  const cabeza = new THREE.Sprite(matCabeza);
  cabeza.scale.setScalar(0.3);
  scene.add(linea, cabeza);
  return { curva, linea, cabeza, mat, geo };
}
function quitarArco(a) {
  scene.remove(a.linea, a.cabeza);
  a.geo.dispose();
  a.mat.dispose();
}

// ---------- Interfaz ----------
let gui;
function crearGUI() {
  gui = new GUI({ title: "Ajustes" });
  gui.add(estado, "velocidad", 60, 6000).name("Velocidad (s/s)");
  gui.add(estado, "mostrarArcos").name("Mostrar arcos");
  gui.add(estado, "maxArcos", 50, 1000, 1).name("Máximo de arcos");
  gui.add(estado, "girar").name("Girar cámara");
  gui.close();
}

function ponerPlay(v) {
  estado.reproducir = v;
  el.play.textContent = v ? "Pausar" : "Reproducir";
}
el.play.addEventListener("click", () => ponerPlay(!estado.reproducir));
addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target === document.body) { e.preventDefault(); ponerPlay(!estado.reproducir); }
});

// Gráfico de viajes por hora, también sirve para moverse en el tiempo
const dpr = () => Math.min(devicePixelRatio, 2);
function ajustarHist() {
  el.hist.width = Math.round(el.hist.clientWidth * dpr());
  el.hist.height = Math.round(el.hist.clientHeight * dpr());
}
function dibujarHist(prog) {
  const c = el.hist, g = c.getContext("2d"), W = c.width, H = c.height, p = dpr();
  g.clearRect(0, 0, W, H);
  const n = bins.length, bw = W / n;
  for (let i = 0; i < n; i++) {
    const h = Math.max(2 * p, (bins[i] / maxBin) * (H - 6 * p));
    g.fillStyle = (i + 0.5) / n <= prog ? "rgba(70,217,255,0.85)" : "rgba(143,160,184,0.28)";
    g.fillRect(i * bw + bw * 0.14, H - h, bw * 0.72, h);
  }
  g.fillStyle = "#ffb347";
  g.fillRect(prog * W - p, 0, 2 * p, H);
}

let arrastrando = false;
const irA = (e) => {
  const r = el.hist.getBoundingClientRect();
  const f = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width));
  saltarA(f * 24);
};
el.hist.addEventListener("pointerdown", (e) => { arrastrando = true; el.hist.setPointerCapture(e.pointerId); irA(e); });
el.hist.addEventListener("pointermove", (e) => { if (arrastrando) irA(e); });
el.hist.addEventListener("pointerup", () => { arrastrando = false; });

// Modos de visualización, ranking y leyenda
let ultimoRank = 0;
function ponerModo(m) {
  estado.modo = m;
  document.body.dataset.modo = m;
  el.bAct.setAttribute("aria-pressed", String(m === "actividad"));
  el.bBal.setAttribute("aria-pressed", String(m === "balance"));
  el.rTitulo.textContent = m === "balance" ? "Más desequilibradas" : "Más salidas hasta ahora";
  ultimoRank = 0;
}
el.bAct.addEventListener("click", () => ponerModo("actividad"));
el.bBal.addEventListener("click", () => ponerModo("balance"));
addEventListener("keydown", (e) => {
  if (e.target !== document.body) return;
  if (e.code === "KeyB") ponerModo(estado.modo === "balance" ? "actividad" : "balance");
  if (e.code === "KeyL") el.lateral.hidden = !el.lateral.hidden;   // oculta los paneles para grabar
});

const filas = [];
for (let k = 0; k < FILAS_RANKING; k++) {
  const li = document.createElement("li"), n = document.createElement("span"), v = document.createElement("span");
  n.className = "r-nombre"; v.className = "r-valor";
  li.append(n, v); li.hidden = true;
  el.rLista.appendChild(li);
  filas.push({ li, n, v });
}
el.rLista.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li || li.dataset.idx === undefined) return;
  sel = Number(li.dataset.idx);
  el.tarjeta.hidden = false;
});

function actualizarRanking(ahora) {
  if (ahora - ultimoRank < 250) return;
  ultimoRank = ahora;
  const bal = estado.modo === "balance";
  const claves = estaciones.map((e) => (bal ? Math.abs(e.llegadas - e.salidas) : e.salidas));
  const orden = claves.map((_, i) => i).sort((a, b) => claves[b] - claves[a]).slice(0, FILAS_RANKING);
  filas.forEach((f, k) => {
    const i = orden[k];
    if (i === undefined || claves[i] === 0) { f.li.hidden = true; delete f.li.dataset.idx; return; }
    const e = estaciones[i], b = e.llegadas - e.salidas;
    f.li.hidden = false;
    f.li.dataset.idx = i;
    f.n.textContent = e.nombre;
    f.v.textContent = bal ? (b > 0 ? "+" : "−") + Math.abs(b) : e.salidas;
    f.v.className = "r-valor" + (bal ? (b > 0 ? " mas" : " menos") : "");
  });
}
ponerModo("actividad");

// Selección de estaciones: la más cercana al puntero en pantalla
const v3 = new THREE.Vector3();
function buscar(x, y) {
  let mejor = -1, dmin = 20;
  estaciones.forEach((e, i) => {
    v3.copy(e.pos).project(camera);
    if (v3.z > 1) return;
    const d = Math.hypot((v3.x * 0.5 + 0.5) * innerWidth - x, (-v3.y * 0.5 + 0.5) * innerHeight - y);
    if (d < dmin) { dmin = d; mejor = i; }
  });
  return mejor;
}
let downX = 0, downY = 0;
const lienzo = renderer.domElement;
lienzo.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
lienzo.addEventListener("pointerup", (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;   // fue un arrastre
  sel = buscar(e.clientX, e.clientY);
  el.tarjeta.hidden = sel < 0;
});
lienzo.addEventListener("pointermove", (e) => {
  lienzo.style.cursor = buscar(e.clientX, e.clientY) >= 0 ? "pointer" : "grab";
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  ajustarHist();
});

// ---------- Bucle ----------
const clock = new THREE.Clock();
let ultimoMin = -1, ultimoCurso = -1, ultimoTotal = -1;

function animar() {
  requestAnimationFrame(animar);
  const dt = Math.min(clock.getDelta(), 0.1);
  const ahora = performance.now();

  // Entrada de cámara al cargar
  if (intro < 1) {
    intro = Math.min(1, intro + dt / 2.8);
    camera.position.lerpVectors(camInicio, camFinal, 1 - Math.pow(1 - intro, 3));
  }
  controls.enabled = intro >= 1;
  controls.autoRotate = estado.girar && intro >= 1;

  const dtMs = estado.reproducir ? dt * estado.velocidad * 1000 : 0;
  tiempo += dtMs;
  if (tiempo >= data.dayStart + 86400000) saltarA(0);

  // Viajes que empiezan ahora
  const trips = data.trips;
  while (siguiente < trips.length && trips[siguiente][0] <= tiempo) {
    const [ini, fin, o, d] = trips[siguiente++];
    const eo = estaciones[o], ed = estaciones[d];
    eo.actividad += 1; eo.salidas++;
    if (fin < tiempo) { ed.llegadas++; continue; }
    if (o !== d && estado.mostrarArcos && activos.length < estado.maxArcos) {
      activos.push({ ini, fin, d, llego: false, tFin: 0, ...crearArco(eo.pos, ed.pos) });
    }
  }

  // Arcos: crecen durante el viaje y se desvanecen al llegar
  let enCurso = 0;
  activos = activos.filter((a) => {
    if (!a.llego) {
      const prog = Math.min((tiempo - a.ini) / (a.fin - a.ini), 1);
      a.geo.setDrawRange(0, Math.max(2, Math.ceil(prog * (NPTS - 1)) + 1));
      a.mat.opacity = opacidadArco();
      a.cabeza.position.copy(a.curva.getPoint(prog));
      if (prog >= 1) {
        a.llego = true; a.tFin = ahora;
        a.cabeza.visible = false;
        estaciones[a.d].actividad += 0.6;
        estaciones[a.d].llegadas++;
      } else { enCurso++; }
      return true;
    }
    const k = (ahora - a.tFin) / 1200;
    if (k >= 1) { quitarArco(a); return false; }
    a.mat.opacity = opacidadArco() * (1 - k);
    return true;
  });

  // Estaciones: tamaño, brillo y color según la actividad reciente
  const decae = Math.pow(0.5, dtMs / 600000);   // se enfrían a los 10 min simulados
  const balance = estado.modo === "balance";
  estaciones.forEach((e, i) => {
    e.actividad *= decae;
    const mat = e.sprite.material;
    let tam, brillo;
    if (balance) {
      // Cian: recibe más bicis de las que salen. Ámbar: pierde bicis.
      const b = e.llegadas - e.salidas;
      const t = Math.min(Math.abs(b) / escalaBalance, 1);
      mat.color.copy(COLOR_NEUTRA).lerp(b >= 0 ? COLOR_DESTINO : COLOR_ORIGEN, t);
      tam = TAM_ESTACION * 0.9 + t * 0.55;
      brillo = 0.3 + 0.7 * t;
    } else {
      const a = Math.min(e.actividad, 6);
      mat.color.copy(COLOR_FRIA).lerp(COLOR_CALIDA, Math.min(a / 5, 1));
      tam = TAM_ESTACION + a * 0.07;
      brillo = 0.45 + 0.55 * (a / 6);
    }
    if (i === sel) brillo = Math.max(brillo, 0.9);
    e.sprite.scale.setScalar(tam * (i === sel ? 1.6 : 1));
    mat.opacity = brillo * BRILLO_ESTACION;
  });

  // Textos
  const minuto = Math.floor(tiempo / 60000);
  if (minuto !== ultimoMin) {
    ultimoMin = minuto;
    el.hora.textContent = new Date(tiempo).toLocaleTimeString("es-ES", {
      timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  }
  if (enCurso !== ultimoCurso) { ultimoCurso = enCurso; el.curso.textContent = enCurso; }
  if (siguiente !== ultimoTotal) { ultimoTotal = siguiente; el.total.textContent = siguiente.toLocaleString("es-ES"); }
  if (sel >= 0) {
    const s = estaciones[sel];
    el.tNombre.textContent = s.nombre;
    const b = s.llegadas - s.salidas;
    el.tDatos.textContent = `${s.salidas} salidas, ${s.llegadas} llegadas. Balance: ${b > 0 ? "+" : b < 0 ? "−" : ""}${Math.abs(b)} bicis`;
  }
  actualizarRanking(ahora);
  dibujarHist((tiempo - data.dayStart) / 86400000);

  controls.update();
  renderer.render(scene, camera);
}