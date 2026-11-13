
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";

const ANCHO = 10;

// ---------- Escena ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b14);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.up.set(0, 0, 1);                 // el mapa está en el plano XY
camera.position.set(0, -9, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);

// ---------- Interfaz HTML ----------
function caja(css) {
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;color:white;font-family:sans-serif;" + css;
  document.body.appendChild(d);
  return d;
}
const reloj = caja("top:10px;left:10px;font-size:20px;");
const info = caja("bottom:10px;left:10px;font-size:16px;background:#000a;padding:8px 12px;border-radius:6px;display:none;");

// ---------- Estado ----------
const estado = { reproducir: true, velocidad: 600, hora: 0, maxArcos: 300, mostrarArcos: true };
let data = null, tiempo = 0, siguiente = 0, activos = [];
const estaciones = [], esferas = [];
const geoEsfera = new THREE.SphereGeometry(1, 12, 12);
const geoBola = new THREE.SphereGeometry(0.04, 8, 8);
const matBola = new THREE.MeshBasicMaterial({ color: 0x111111 });
const matLinea = new THREE.LineBasicMaterial({ color: 0xcc3300, transparent: true, opacity: 0.6 });

// ---------- Carga ----------
fetch("./viajes.json")
  .then(r => {
    if (!r.ok) throw new Error("No se encuentra viajes.json (" + r.status + ")");
    return r.json();
  })
  .then(iniciar)
  .catch(err => {
    reloj.textContent = "Error: " + err.message;
    console.error(err);
  });

// ---------- Mapa base (teselas) ----------
const CARTO_KEY = "cb1_588r_1_20e1af17d8ba8b8657815576";
const TILE = 256;

function lonToX(lon, z) { return (lon + 180) / 360 * 2 ** z; }
function latToY(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z;
}

function cargarTeselas(base, z, x0, y0, nx, ny) {
  const canvas = document.createElement("canvas");
  canvas.width = nx * TILE;
  canvas.height = ny * TILE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#151525";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  base.material.color.set(0xffffff);
  base.material.map = tex;
  base.material.needsUpdate = true;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, i * TILE, j * TILE, TILE, TILE);
        tex.needsUpdate = true;
      };
      img.src = `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x0 + i}/${y0 + j}.png?key=${CARTO_KEY}`;
    }
  }
}

caja("bottom:4px;right:8px;font-size:11px;opacity:0.7;")
  .textContent = "© OpenStreetMap contributors © CARTO";

function iniciar(d) {
  data = d;
  const lats = d.stations.map(s => s.lat), lons = d.stations.map(s => s.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
  const mLat = (latMax - latMin) * 0.08, mLon = (lonMax - lonMin) * 0.08;

  // Mayor zoom que quepa en una cuadrícula de 5x5 teselas como máximo
  let z = 16, x0, x1, y0, y1;
  for (; z > 8; z--) {
    x0 = Math.floor(lonToX(lonMin - mLon, z));
    x1 = Math.floor(lonToX(lonMax + mLon, z));
    y0 = Math.floor(latToY(latMax + mLat, z));
    y1 = Math.floor(latToY(latMin - mLat, z));
    if (x1 - x0 + 1 <= 7 && y1 - y0 + 1 <= 7) break;
  }
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const cx = x0 + nx / 2, cy = y0 + ny / 2;
  const esc = ANCHO / Math.max(nx, ny);

  // Plano del mapa
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(nx * esc, ny * esc),
    new THREE.MeshBasicMaterial({ color: 0x151525 })
  );
  scene.add(base);
  cargarTeselas(base, z, x0, y0, nx, ny);

  // Estaciones
  d.stations.forEach(s => {
    const fx = lonToX(s.lon, z), fy = latToY(s.lat, z);
    const pos = new THREE.Vector3((fx - cx) * esc, -(fy - cy) * esc, 0.01);
    const esfera = new THREE.Mesh(geoEsfera, new THREE.MeshBasicMaterial({ color: 0x3399ff }));
    esfera.position.copy(pos);
    esfera.scale.setScalar(0.04);
    esfera.userData.idx = estaciones.length;
    scene.add(esfera);
    esferas.push(esfera);
    estaciones.push({ nombre: s.n, pos, esfera, actividad: 0, salidas: 0, llegadas: 0 });
  });

  reiniciar();
  crearGUI();
  animar();
}

// ---------- Control del tiempo ----------
function saltarA(horas) {
  tiempo = data.dayStart + horas * 3600000;
  activos.forEach(quitarArco);
  activos = [];
  siguiente = data.trips.findIndex(t => t[0] >= tiempo);
  if (siguiente < 0) siguiente = data.trips.length;
  estaciones.forEach(e => { e.actividad = 0; e.salidas = 0; e.llegadas = 0; });
}
function reiniciar() { saltarA(0); }

let ctrlHora;
function crearGUI() {
  const gui = new GUI();
  gui.add(estado, "reproducir");
  gui.add(estado, "velocidad", 60, 6000).name("segundos/seg");
  ctrlHora = gui.add(estado, "hora", 0, 24, 0.01).name("hora del día")
    .listen().onChange(h => saltarA(h));
  gui.add(estado, "mostrarArcos").name("mostrar arcos");
  gui.add(estado, "maxArcos", 50, 1000, 1).name("máx. arcos");
}

// ---------- Arcos ----------
function crearArco(A, B) {
  const medio = A.clone().add(B).multiplyScalar(0.5);
  medio.z += A.distanceTo(B) * 0.4;
  const curva = new THREE.QuadraticBezierCurve3(A, medio, B);
  const linea = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curva.getPoints(24)), matLinea);
  const bola = new THREE.Mesh(geoBola, matBola);
  scene.add(linea, bola);
  return { curva, linea, bola };
}
function quitarArco(a) {
  scene.remove(a.linea, a.bola);
  a.linea.geometry.dispose();
}

// ---------- Bucle ----------
const clock = new THREE.Clock();
function animar() {
  requestAnimationFrame(animar);
  const dtMs = estado.reproducir ? clock.getDelta() * estado.velocidad * 1000 : (clock.getDelta(), 0);
  tiempo += dtMs;
  if (tiempo >= data.dayStart + 86400000) reiniciar();

  // Nuevos viajes que empiezan
  const trips = data.trips;
  while (siguiente < trips.length && trips[siguiente][0] <= tiempo) {
    const [ini, fin, o, d] = trips[siguiente++];
    if (fin < tiempo) continue;
    const eo = estaciones[o], ed = estaciones[d];
    eo.actividad += 1; eo.salidas++; ed.llegadas++;
    if (o !== d && estado.mostrarArcos && activos.length < estado.maxArcos) {
      activos.push({ ini, fin, d, ...crearArco(eo.pos, ed.pos) });
    }
  }

  // Arcos en curso
  activos = activos.filter(a => {
    const prog = (tiempo - a.ini) / (a.fin - a.ini);
    if (prog >= 1) {
      estaciones[a.d].actividad += 0.5;
      quitarArco(a);
      return false;
    }
    a.bola.position.copy(a.curva.getPoint(prog));
    return true;
  });

  // Estaciones: tamaño y color según actividad reciente
  const decae = Math.pow(0.5, dtMs / 600000);   // vida media de 10 min simulados
  estaciones.forEach(e => {
    e.actividad *= decae;
    const a = Math.min(e.actividad, 6);
    e.esfera.scale.setScalar(0.04 + a * 0.03);
    e.esfera.material.color.setHSL(0.6 - a * 0.1, 1, 0.5);
  });

  estado.hora = (tiempo - data.dayStart) / 3600000;
  reloj.textContent = new Date(tiempo).toLocaleString("es-ES", { timeZone: "America/Toronto" })
    + "  ·  viajes en curso: " + activos.length;

  controls.update();
  renderer.render(scene, camera);
}

// ---------- Clic en estación ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
renderer.domElement.addEventListener("click", e => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(esferas)[0];
  if (hit) {
    const s = estaciones[hit.object.userData.idx];
    info.style.display = "block";
    info.textContent = `${s.nombre} · salidas hoy: ${s.salidas} · llegadas: ${s.llegadas}`;
  } else {
    info.style.display = "none";
  }
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});