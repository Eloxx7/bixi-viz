import csv, json, sys
from datetime import datetime
from zoneinfo import ZoneInfo
from collections import Counter

ARCHIVO = "viajes.csv"         
TZ = ZoneInfo("America/Toronto")  # hora de Montreal

def dia(ms):
    return datetime.fromtimestamp(ms / 1000, TZ).strftime("%Y-%m-%d")

modo = sys.argv[1] if len(sys.argv) > 1 else "list"

if modo == "list":                      # python preparar.py list
    cuenta = Counter()
    with open(ARCHIVO, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            try:
                cuenta[dia(int(r["STARTTIMEMS"]))] += 1
            except Exception:
                pass
    for d, n in sorted(cuenta.items()):
        print(d, n)
else:                                   # python preparar.py 2026-03-16
    sel = modo
    inicio_dia = int(datetime.strptime(sel, "%Y-%m-%d")
                     .replace(tzinfo=TZ).timestamp() * 1000)
    idx, estaciones, viajes = {}, [], []

    def est(nombre, lat, lon):
        if nombre not in idx:
            idx[nombre] = len(estaciones)
            estaciones.append({"n": nombre,
                               "lat": round(float(lat), 6),
                               "lon": round(float(lon), 6)})
        return idx[nombre]

    with open(ARCHIVO, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            try:
                ini, fin = int(r["STARTTIMEMS"]), int(r["ENDTIMEMS"])
                if dia(ini) != sel or not (0 < fin - ini <= 2 * 3600 * 1000):
                    continue
                o = est(r["STARTSTATIONNAME"], r["STARTSTATIONLATITUDE"], r["STARTSTATIONLONGITUDE"])
                d = est(r["ENDSTATIONNAME"], r["ENDSTATIONLATITUDE"], r["ENDSTATIONLONGITUDE"])
                viajes.append([ini, fin, o, d])
            except Exception:
                continue

    viajes.sort()
    with open("viajes.json", "w", encoding="utf-8") as f:
        json.dump({"dayStart": inicio_dia, "stations": estaciones, "trips": viajes},
                  f, separators=(",", ":"))
    print(len(estaciones), "estaciones,", len(viajes), "viajes")