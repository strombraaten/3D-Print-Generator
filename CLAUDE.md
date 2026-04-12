# Gitternett-krok – prosjektkontekst for Claude Code

## Hva dette er

Et parametrisk 3D-designverktøy for å lage kroker og oppbevaring til en bod med gitternett-vegg (grid mesh). Startet i Cowork, videreføres her for å bygge det som en ordentlig webapp.

Primær bruker: Simen (ssb@variant.no), Variant-ansatt.

---

## Nåværende tilstand

### Filer i dette prosjektet

| Fil | Hva den gjør |
|-----|-------------|
| `gitternett_krok_visualisering.html` | Standalone 3D-visualisering, Three.js r128 + lil-gui UMD. Kjør direkte i nettleser. |
| `gitternett_krok_v1.stl` | Generert 3D-modell, klar for import i Bambu Studio |
| `gitternett_krok_v1.3mf` | Samme, men i .3mf-format (foretrukket av Bambu Studio) |
| `generate_hook.py` | Python-script som genererer STL/3MF fra parametere (trimesh + shapely) |

### Hva HTML-visualiseringen gjør

- **Live 3D-preview** av kroken med lil-gui-panel til høyre
- **Justerbare parametere**: tråddiameter, toleranse, veggtykkelse, krokk-høyde, armlengde, armtykkelse, bredde, stopper-høyde/-tykkelse
- **Eksport direkte fra nettleseren**: knapper for `.3mf` (JSZip) og `.stl` (binær ArrayBuffer)
- **"Kopier Python-parametere"**: kopierer gjeldende verdier til clipboard, klar til å lime inn i `generate_hook.py`
- Viser tråd-visualisering (slå på/av)

### Geometrien – kjernekonseptet

Kroken genereres fra et **2D-polygon i ZY-planet** som ekstruderes i X-retningen (bredde).

```
Koordinatsystem:
  Z = dybde (positivt = ut fra vegg, mot rom)
  Y = høyde (positivt = opp)
  X = bredde (ekstrusjonsretning)

Tråd-sentrum = (Z=0, Y=0)
```

Profilpunktene (polygon-hjørner) definerer J-formen:

```javascript
var v = [
  [zb,  ysb],  // bakvegg, bunn-venstre
  [zb,  yt],   // bakvegg, topp
  [zfo, yt],   // toppkappe, høyre
  [zfo, ybb],  // frontvegg ved arm-kryss
  [zsi, ybb],  // arm, flate frem til stopper
  [zsi, yst],  // stopper, indre topp
  [zat, yst],  // stopper, ytre topp
  [zat, yab],  // arm-spiss, bunn
  [zfo, yab],  // arm bunn ved frontvegg
  [zfi, yab],  // frontvegg indre, bunn
  [zfi, wg],   // frontvegg indre, slot-topp
  [zbi, wg],   // bakvegg indre, slot-topp
  [zbi, ysb],  // bakvegg indre, bunn → lukker polygon
];
```

Tråd-spalten er **åpen nedover** (Y < -wg) – kroken senkes ned over tråden, vekten holder den på plass.

### Gitternett-spesifikasjoner

- Tråddiameter: **4 mm**
- Ruteavstand (outer): **54 × 54 mm**
- Indre åpning: **~45 × 46 mm**
- Nåværende toleranse i modellen: **0.5 mm** (funker bra med PLA, justerbart)

---

## Tre ideer å jobbe videre med

### 1. 🌐 Webapp med Leva + React Three Fiber

**Formål:** Publisere som en offentlig verktøy under `simenlager.no`-paraplyprosjektene.

**Arkitektur som gir mening:**
- React + Vite
- `@react-three/fiber` (R3F) for 3D-rendering
- `leva` for parameterpanelet (samme konsept som lil-gui, men React-native og mer stylingmuligheter)
- `@react-three/drei` for hjelpere (OrbitControls, etc.)
- Eksport: samme JSZip/.3mf-logikk som nå, bare portert til React

**Hva som kan gjenbrukes:**
- Geometrilogikken (polygon-punktene og utregningene) → porteres til JS-funksjon
- Eksport-funksjonene (export3MF, exportSTL) → minimale endringer
- Parametersettet

**Mulig scope-utvidelse:** Ikke bare gitternett-krok, men et generelt verktøy for småting man printer til hjemmet. Kategorier: bods-oppbevaring, kjøkken-organiser, verktøy-holder, etc.

**Anbefalt verktøy i Claude Code:** compound engineering-plugin

---

### 2. 🔵 Avrundet tråd-spalte (semi-sirkulær kanal)

**Problem:** Firkantet spalte mot rund tråd → punktkontakt i to skarpe hjørner. Dårlig kraftfordeling, potensielt slitasje på tråden.

**Løsning:** Erstatt de to rette hjørnene i bunnen av spalten med en halvsirkel:

```python
# I stedet for:
# [z_back_inner, y_slot_bot], ..., [z_front_inner, y_slot_bot]

# Legg til halvsirkelbue med radius = wire_r + tol
# Senter: (0, y_slot_bot + wire_r + tol) = (0, 0)  ← dvs. tråd-sentrum
# Buen går fra vinkel 180° til 0° (undre halvdel)
```

I Shapely brukes `arc`-tilnærming via `Polygon` med mange punkter, eller man bruker `shapely.geometry.Point(0, 0).buffer(wire_r + tol)` og klipper.

I Three.js: `THREE.Shape` støtter `absarc()` direkte i profilen.

**Effekt:** Linjeformet kontakt langs hele krokens bredde → sterkere, penere, mer skånsomt mot tråden.

---

### 3. 🏗️ Styrkeanalyse + materialoptimalisering

**Problemstilling:** Vil ha sterk krok uten å bruke unødvendig mye PLA.

**Analytisk tilnærming (bjelketeori):**

Armen er en utkraget bjelke (cantilever). Bøyemomentet i roten av armen:

```
M = F × L
σ = M × c / I

der:
  F = last (vekt av klappstol, typisk 5–10 kg → 50–100 N)
  L = arm_lengde (50 mm = 0.05 m)
  c = arm_tykkelse / 2 (avstand fra nøytralaksen til ytterflaten)
  I = (bredde × arm_tykkelse³) / 12  (annet arealmoment, rektangulær tverrsnitt)
  σ = bøyespenning
```

PLA har typisk bruddstyrke **~50 MPa**, men FDM-print er ~60–70% av dette → effektiv styrke **~30–35 MPa**.

**Kritiske punkter i denne modellen:**
1. Rot av arm (bøyemoment fra vekten)
2. Rot av J-klyp (torsjon + skjærkraft fra tråden)

**Enkel forbedring uten mer materiale:** Avrunde overgangen arm↔kropp (filet-radius ~5–8 mm) for å spre spenningskonsentrasjonen.

**Kan bygges som kalkulator** ved siden av 3D-vieweren – input: forventet last, output: beregnet spenning vs. kapasitet med go/no-go-indikator.

---

## Tekniske beslutninger tatt (og hvorfor)

| Beslutning | Hvorfor |
|-----------|---------|
| Three.js r128 (ikke nyere) | cdnjs har r128 som stabil CDN-versjon uten bundler |
| lil-gui UMD (ikke Leva) | Leva krever React; lil-gui er vanilla JS, CDN-tilgjengelig |
| `type="module"` unngått | ES-moduler fra CDN blokkeres av CORS på `file://` |
| JSZip for .3mf | .3mf er bare ZIP med XML inni; ingen ekstern lib nødvendig utover JSZip |
| `hookMesh.position.z` for sentrering | `BufferGeometry.translate()` er read-only i r128; sett offset på mesh i stedet |
| `wireMesh.rotation.x = Math.PI/2` | CylinderGeometry langs Y; rotation.x legger den langs Z (bredderetningen) |
| Polygon åpen nedover | Kroken senkes ned over tråden → gravity-hold, ingen lås nødvendig |

---

## Neste naturlige steg (prioritert)

1. **Port til React + R3F + Leva** → Webapp-klar versjon
2. **Semi-sirkulær tråd-spalte** → Liten geometri-endring, stor funksjonell forbedring
3. **Styrke-kalkulator** → Viser om valgte dimensjoner holder for gitt last
4. **Oppdater `generate_hook.py`** med stopper-geometrien (er i HTML men ikke i Python-scriptet ennå)
5. **Publiser** under simenlager.no via variant-deploy-plugin

---

## Relevante ressurser

- [Leva docs](https://github.com/pmndrs/leva/blob/main/docs/getting-started/introduction.md)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [3MF-spesifikasjon](https://3mf.io/specification/)
- [Bambu Studio](https://bambulab.com/en/download/studio) – sliceren som brukes
