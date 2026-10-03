# Poppa — lugn ballong-app för barn

En enkel PWA i samma anda och med samma grund som
[Kludd](https://github.com/isak-wallo/Kludd). Byggd för att installeras på en
gammal Android-platta och användas av barn. Språk i appen och i koden
(kommentarer, knappnamn) är **svenska**. Håll det så.

## Vad appen gör

- Fullskärms-himmel (mjuk gradient + stilla moln) där **1–4 ballonger** (högst `MAX_BALLOONS`)
  i mjuka pastellfärger sakta stiger uppåt och vajar lite.
- Trycker man på en ballong **poppar** den — ljudlöst och lugnt: ballongen
  krymper och tonar bort, några små bitar i samma färg glider sakta isär och
  sjunker, och snöret faller (`POP_MS`, 1,4 s). Inga poäng, inga ljud,
  inga snabba effekter — **det ska förbli lugnt och stillsamt**.
- En ny ballong kommer efter en kort paus (`SPAWN_DELAY_MIN/MAX`). Flyger en
  ballong ut ovanför skärmen kommer också en ny. Är himlen helt tom
  börjar en ny ballong genast åka in nerifrån (ingen väntan).
- Träffytan är lite större än ballongen (`HIT_SLACK`) för små fingrar.
- Poppning sker bara vid nedtryck (touchstart), så en hand som vilar på
  skärmen poppar inte ballonger som svävar förbi. Alla fingrar kan poppa.
- Låser orientering till **landskap**, går i fullscreen, layoutlås,
  dö-yta på Android, bakåt-fälla och tyst fullscreen-återtagning — samma
  mekanismer som i Kludd (se Kludds CLAUDE.md för detaljerna och varför).
- Fungerar **offline** som installerad PWA.

## Hosting / driftsättning

- Hostas via **GitHub Pages** från `main` (rot). Repo:
  `https://github.com/isak-wallo/Poppa`. Public URL:
  `https://isak-wallo.github.io/Poppa/`.
- **Inget byggsteg** — filerna servas direkt. Driftsätt = commit + push till
  `main`.

### VIKTIGT vid uppdatering: bumpa SW-versionen
I `sw.js` finns `const VERSION = 'vNN'`. **Höj `VERSION` varje gång du ändrar
filer och pushar**, annars fastnar plattan på gammal cache.

### Arbetsflöde
När en ändring ska nå plattan: bumpa `VERSION`, **commit och push till `main`
direkt**, utan att fråga. Commit-meddelanden på svenska.

## Filer

| Fil | Roll |
|-----|------|
| `index.html` | Start-overlay ("BÖRJA POPPA") + canvas. Inga inline-event. |
| `app.js` | All logik: ballonger, pop, animationsloop, layout, fullscreen, bakåt-fälla, SW-registrering. |
| `style.css` | Fullskärmslayout. |
| `sw.js` | Service worker (cache-first + tyst bakgrundsuppdatering). Bumpa `VERSION`. |
| `manifest.json` | PWA-manifest (`standalone`, `landscape`). |
| `icon-192.png`, `icon-512.png` | App-ikoner (ballong på himmel). |

## Arkitektur i `app.js`

- En canvas (`skyCanvas`) i CSS-pixlar. Bakgrunden förrenderas till en dold
  canvas (`bg`) vid storleksändring, så varje frame bara är en `drawImage` +
  ballongerna — billigt på gammal platta.
- En `requestAnimationFrame`-loop (`frame`) med tidsbaserad rörelse (`dt`,
  max 50 ms så pauser inte ger hopp).
- Ballong-state: `'flyger'` eller `'poppar'`. `scheduleSpawn` / `fillUp`
  ser till att det alltid finns ballonger på väg.

## Konventioner att behålla

- Svenska i UI och kommentarer.
- Ingen byggpipeline, inga dependencies — ren vanilla JS/CSS/HTML.
- Lugnt tempo: få ballonger, långsamma rörelser, mjuka övergångar, inga ljud.
- Bumpa `VERSION` i `sw.js` vid varje ändring som ska nå plattan.
