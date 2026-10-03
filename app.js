document.addEventListener('DOMContentLoaded', () => {
    const skyCanvas = document.getElementById('skyCanvas');
    const ctx = skyCanvas.getContext('2d');
    const skyContainer = document.getElementById('sky-container');

    // Element-referenser — deklarerade först så att funktionerna nedan
    // aldrig kan råka använda dem före deklarationen.
    const startOverlay = document.getElementById('start-overlay');
    const app = document.getElementById('app');

    // Förrenderad bakgrund (himmel + moln). Ritas om bara vid storleksändring,
    // så varje frame bara kostar en drawImage för bakgrunden.
    const bg = document.createElement('canvas');
    const bgCtx = bg.getContext('2d');

    // --- Inställningar för ballongerna ---
    // Allt är medvetet lugnt: få ballonger, långsam rörelse, mjuk pop.
    const MAX_BALLOONS = 4;          // högst så här många ballonger samtidigt
    const RISE_SECONDS = 14;         // ungefär så lång tid tar en färd över skärmen
    const SPAWN_DELAY_MIN = 800;     // ms innan en ny ballong kommer (minst)
    const SPAWN_DELAY_MAX = 1800;    // ms innan en ny ballong kommer (högst)
    const SPAWN_GAP_MIN = 1200;      // ms minst mellan två nya ballonger
    const SPAWN_GAP_MAX = 4500;      // ms högst mellan två nya ballonger (slumpas)
    const POP_MS = 1400;             // hur länge pop-animationen varar
    const HIT_SLACK = 1.3;           // träffytan är lite större än ballongen (små fingrar)
    // Mjuka pastellfärger
    const COLORS = ['#f2a7a7', '#8db3e8', '#b7deaf', '#f5d68f', '#cdb6e6', '#f6c2a2'];

    let W = 0, H = 0;
    let radius = 60;                 // ballongens radie i px, sätts efter skärmstorlek
    const balloons = [];
    // Kö med tidpunkter (performance.now) då nya ballonger ska komma.
    // Hålls utspridd så att det aldrig kommer flera nya på en gång.
    let spawnQueue = [];
    let lastSpawnAt = -Infinity;
    let lastColor = null;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function pickColor() {
        let c;
        do { c = COLORS[Math.floor(Math.random() * COLORS.length)]; } while (c === lastColor);
        lastColor = c;
        return c;
    }

    // Väljer en x-position som inte ligger för nära en annan ballong.
    function pickX() {
        const margin = radius * 1.6;
        let best = rand(margin, Math.max(margin, W - margin));
        for (let tries = 0; tries < 10; tries++) {
            const x = rand(margin, Math.max(margin, W - margin));
            let ok = true;
            for (const b of balloons) {
                if (b.state === 'flyger' && Math.abs(b.baseX - x) < radius * 3) { ok = false; break; }
            }
            if (ok) return x;
            best = x;
        }
        return best;
    }

    // nara = starta precis under kanten, så ballongen syns nästan direkt.
    function spawnBalloon(nara) {
        if (W === 0 || H === 0) return;
        const flying = balloons.filter(b => b.state === 'flyger').length;
        if (flying >= MAX_BALLOONS) return;
        balloons.push({
            state: 'flyger',
            color: pickColor(),
            baseX: pickX(),
            x: 0,
            y: H + radius * (nara ? 1.3 : 4), // startar under skärmkanten (inkl. snöre)
            speed: (H + radius * 6) / RISE_SECONDS * rand(0.85, 1.15),
            swayAmp: radius * rand(0.25, 0.5),
            swaySpeed: rand(0.35, 0.6),
            phase: rand(0, Math.PI * 2),
            age: 0,
            popAge: 0,
            pieces: null
        });
    }

    // Sprider ut kön: varje ny ballong kommer en slumpad stund efter den
    // förra, så poppar man alla på en gång fylls himlen på lite i taget.
    function spreadQueue() {
        let t = lastSpawnAt;
        for (let i = 0; i < spawnQueue.length; i++) {
            t = Math.max(spawnQueue[i], t + rand(SPAWN_GAP_MIN, SPAWN_GAP_MAX));
            spawnQueue[i] = t;
        }
    }

    // Schemalägger en ny ballong efter en kort, slumpad paus.
    function scheduleSpawn(delay) {
        const d = (delay !== undefined) ? delay : rand(SPAWN_DELAY_MIN, SPAWN_DELAY_MAX);
        spawnQueue.push(performance.now() + d);
        spreadQueue();
    }

    // Ser till att det alltid är (eller snart blir) MAX_BALLOONS på väg.
    function fillUp() {
        const flying = balloons.filter(b => b.state === 'flyger').length;
        const missing = MAX_BALLOONS - flying - spawnQueue.length;
        for (let i = 0; i < missing; i++) scheduleSpawn();
    }

    // --- Pop ---
    // Ingen smäll och inga snabba effekter: ballongen krymper och tonar bort
    // lugnt, och några små bitar i samma färg glider isär och sjunker sakta.
    function popBalloon(b) {
        b.state = 'poppar';
        b.popAge = 0;
        b.pieces = [];
        const n = 6;
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
            b.pieces.push({
                ang: ang,
                dist: radius * rand(0.7, 1.1),
                size: radius * rand(0.12, 0.18),
                rot: rand(0, Math.PI),
                spin: rand(-1, 1)
            });
        }
        scheduleSpawn();
    }

    function hitTest(px, py) {
        // Senast ritade ballong ligger överst — testa baklänges.
        for (let i = balloons.length - 1; i >= 0; i--) {
            const b = balloons[i];
            if (b.state !== 'flyger') continue;
            const rx = radius * HIT_SLACK;
            const ry = radius * 1.2 * HIT_SLACK;
            const dx = (px - b.x) / rx;
            const dy = (py - b.y) / ry;
            if (dx * dx + dy * dy <= 1) return b;
        }
        return null;
    }

    function tryPop(clientX, clientY) {
        const r = skyCanvas.getBoundingClientRect();
        const b = hitTest(clientX - r.left, clientY - r.top);
        if (b) popBalloon(b);
    }

    // --- Uppdatering ---
    function update(dt) {
        // Finns det inga ballonger kvar i luften ska man inte behöva vänta:
        // då börjar en ny ballong genast åka in nerifrån.
        const now = performance.now();
        if (W > 0 && H > 0 && !balloons.some(b => b.state === 'flyger')) {
            spawnBalloon(true);
            lastSpawnAt = now;
            spawnQueue.shift();      // den här ballongen ersätter den första i kön
            spreadQueue();
        } else if (spawnQueue.length && spawnQueue[0] <= now) {
            // Högst en ny ballong per gång, sedan sprids resten ut igen
            spawnQueue.shift();
            spawnBalloon();
            lastSpawnAt = now;
            spreadQueue();
        }
        for (let i = balloons.length - 1; i >= 0; i--) {
            const b = balloons[i];
            b.age += dt;
            if (b.state === 'flyger') {
                b.y -= b.speed * dt;
                b.x = b.baseX + Math.sin(b.age * b.swaySpeed + b.phase) * b.swayAmp;
                // Flög ut ovanför skärmen utan att poppas -> ny ballong
                if (b.y < -radius * 2) {
                    balloons.splice(i, 1);
                    scheduleSpawn();
                }
            } else {
                b.popAge += dt * 1000;
                if (b.popAge >= POP_MS) balloons.splice(i, 1);
            }
        }
    }

    // --- Ritning ---
    function drawBackground() {
        bg.width = W;
        bg.height = H;
        const g = bgCtx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#bcdcf4');
        g.addColorStop(1, '#eef6fb');
        bgCtx.fillStyle = g;
        bgCtx.fillRect(0, 0, W, H);

        // Några stilla, mjuka moln
        const m = Math.min(W, H);
        bgCtx.fillStyle = 'rgba(255,255,255,0.75)';
        drawCloud(W * 0.18, H * 0.2, m * 0.09);
        drawCloud(W * 0.72, H * 0.13, m * 0.07);
        drawCloud(W * 0.55, H * 0.42, m * 0.06);
    }

    function drawCloud(x, y, s) {
        bgCtx.beginPath();
        bgCtx.arc(x, y, s, 0, Math.PI * 2);
        bgCtx.arc(x + s * 1.1, y + s * 0.2, s * 0.8, 0, Math.PI * 2);
        bgCtx.arc(x - s * 1.1, y + s * 0.25, s * 0.7, 0, Math.PI * 2);
        bgCtx.arc(x + s * 0.3, y + s * 0.45, s * 0.8, 0, Math.PI * 2);
        bgCtx.fill();
    }

    function drawString(x, y, len, sway, alpha) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#8a96a3';
        ctx.lineWidth = Math.max(1.5, radius * 0.03);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + sway, y + len * 0.5, x - sway * 0.5, y + len);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawBalloonBody(x, y, color, scale, alpha) {
        const rx = radius * scale;
        const ry = radius * 1.2 * scale;
        ctx.globalAlpha = alpha;

        // Knut
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + ry - 2);
        ctx.lineTo(x - rx * 0.14, y + ry + rx * 0.2);
        ctx.lineTo(x + rx * 0.14, y + ry + rx * 0.2);
        ctx.closePath();
        ctx.fill();

        // Kropp
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mjuk glans
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(x - rx * 0.38, y - ry * 0.4, rx * 0.18, ry * 0.26, -0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    function easeOut(t) { return 1 - (1 - t) * (1 - t); }

    function draw() {
        ctx.drawImage(bg, 0, 0);
        const strLen = radius * 2.2;
        for (const b of balloons) {
            const ry = radius * 1.2;
            if (b.state === 'flyger') {
                const sway = Math.cos(b.age * b.swaySpeed + b.phase) * radius * 0.25;
                drawString(b.x, b.y + ry + radius * 0.2, strLen, sway, 1);
                drawBalloonBody(b.x, b.y, b.color, 1, 1);
            } else {
                const t = Math.min(1, b.popAge / POP_MS);
                const e = easeOut(t);
                // Snöret sjunker sakta och tonar bort
                drawString(b.x, b.y + ry + radius * 0.2 + e * radius * 1.5, strLen, 0, 1 - t);
                // Kroppen krymper och tonar bort under första halvan
                const bt = Math.min(1, t * 2.5);
                if (bt < 1) drawBalloonBody(b.x, b.y, b.color, 1 - easeOut(bt) * 0.6, 1 - bt);
                // Små bitar glider isär och sjunker lite
                ctx.fillStyle = b.color;
                ctx.globalAlpha = 1 - t;
                for (const p of b.pieces) {
                    const px = b.x + Math.cos(p.ang) * p.dist * e;
                    const py = b.y + Math.sin(p.ang) * p.dist * e + t * t * radius * 0.8;
                    ctx.save();
                    ctx.translate(px, py);
                    ctx.rotate(p.rot + p.spin * t);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
            }
        }
    }

    // --- Animationsloop (en frame per requestAnimationFrame) ---
    let lastTime = 0;
    function frame(now) {
        // Begränsa dt så att en paus (t.ex. dold flik) inte ger ett hopp
        const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
        lastTime = now;
        update(dt);
        draw();
        requestAnimationFrame(frame);
    }

    function resizeCanvas() {
        if (!skyContainer) return;
        const w = skyContainer.clientWidth;
        const h = skyContainer.clientHeight;
        // Att sätta width/height nollställer canvas-bufferten — gör det bara
        // vid faktisk ändring.
        if (skyCanvas.width !== w || skyCanvas.height !== h) {
            skyCanvas.width = w;
            skyCanvas.height = h;
            W = w;
            H = h;
            radius = Math.max(30, Math.min(W, H) * 0.11);
            drawBackground();
            // Håll kvar ballongerna innanför kanterna efter storleksändring
            for (const b of balloons) {
                b.baseX = Math.min(Math.max(b.baseX, radius * 1.6), Math.max(radius * 1.6, W - radius * 1.6));
            }
            if (balloons.length === 0 && spawnQueue.length === 0) {
                // Ballongerna kommer en i taget i början, inte alla på en gång.
                // Den första kommer direkt via update() (tom himmel).
                scheduleSpawn(rand(2500, 3500));
                scheduleSpawn(rand(5000, 6500));
                scheduleSpawn(rand(7500, 9000));
            }
        }
    }

    // Layoutlås
    let lockedW = 0, lockedH = 0;
    let lockLandscape = null;
    let shrinkTimer = null;

    // Hur länge (ms) en MINDRE layout-viewport måste bestå innan låset
    // släpper och appen krymper till den. Transienta systemfält i immersive
    // fullscreen ändrar aldrig innerWidth/innerHeight och triggar inte detta.
    // En bestående mindre viewport är ett äkta lägesbyte — t.ex. skärmlåsning
    // (pinning) som tvingar fram status-/navigeringsfält.
    const SHRINK_ADOPT_MS = 400;

    // Statisk dö-yta: en permanent svart remsa där Androids systemknappar
    // (bakåt/hem/översikt) hamnar, så de inte ligger över himlen. 48 px ≈ en
    // systemknappshöjd. Telefon (låst höjd < 550 px) -> remsa till höger,
    // tablet -> remsa i botten. Bara på Android — på iPad/dator är den 0.
    const DEAD_ZONE = 48;
    const PHONE_LANDSCAPE_MAX_H = 550;
    const IS_ANDROID = /Android/i.test(navigator.userAgent);

    function applyLayout() {
        const isLandscape = window.innerWidth > window.innerHeight;
        const w = window.innerWidth;
        const h = window.innerHeight;

        if (lockLandscape === null || isLandscape !== lockLandscape) {
            lockLandscape = isLandscape;
            lockedW = w;
            lockedH = h;
            if (shrinkTimer) { clearTimeout(shrinkTimer); shrinkTimer = null; }
        } else {
            if (w > lockedW) lockedW = w;
            if (h > lockedH) lockedH = h;
        }

        // Mindre viewport än låset? Anta den nya storleken om den består.
        if (w < lockedW || h < lockedH) {
            if (shrinkTimer) clearTimeout(shrinkTimer);
            shrinkTimer = setTimeout(() => {
                shrinkTimer = null;
                const w2 = window.innerWidth;
                const h2 = window.innerHeight;
                if ((w2 > h2) === lockLandscape && (w2 < lockedW || h2 < lockedH)) {
                    lockedW = w2;
                    lockedH = h2;
                    applyLayout();
                }
            }, SHRINK_ADOPT_MS);
        }

        if (app) {
            app.style.width = lockedW + 'px';
            app.style.height = lockedH + 'px';
            const isPhone = lockedH < PHONE_LANDSCAPE_MAX_H;
            const staticPad = IS_ANDROID ? DEAD_ZONE : 0;
            let dynPad = 0;
            if (window.visualViewport) {
                const dyn = isPhone
                    ? lockedW - window.visualViewport.width - window.visualViewport.offsetLeft
                    : lockedH - window.visualViewport.height - window.visualViewport.offsetTop;
                if (dyn > 0) dynPad = dyn;
            }
            if (isPhone) {
                app.style.paddingRight = (staticPad + dynPad) + 'px';
                app.style.paddingBottom = '';
            } else {
                app.style.paddingBottom = (staticPad + dynPad) + 'px';
                app.style.paddingRight = '';
            }
        }
        resizeCanvas();
    }

    // --- Tryck ---
    // Varje nytt finger kan poppa (bara vid nedtryck, inte när man drar),
    // så en hand som vilar på skärmen poppar inte ballonger som svävar förbi.
    function onTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            tryPop(t.clientX, t.clientY);
        }
    }

    function onMouseDown(e) {
        if (e.button !== 0) return;
        tryPop(e.clientX, e.clientY);
    }

    function isInstalledApp() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    function startApp() {
        // Begär alltid fullscreen — även om fullscreenElement ser satt ut.
        // Android kan tvinga fram systemfälten (t.ex. vid skärmlåsning) utan
        // att HTML-fullscreen formellt släpps.
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Helskärm misslyckades: ${err.message}`);
            });
        } else if (document.documentElement.webkitRequestFullscreen) {
            // Äldre iPads (före iPadOS 16.4) har bara webkit-prefixet.
            document.documentElement.webkitRequestFullscreen();
        }
        startOverlay.style.display = 'none';
        setTimeout(applyLayout, 100);
    }

    function showStartOverlay() {
        startOverlay.style.display = 'flex';
    }

    document.getElementById('start-btn').addEventListener('click', startApp);

    // --- Back-knapp: håll användaren kvar i appen ---
    // Samma skydd som i Kludd. Bakåt får aldrig lämna sidan — i pinnat läge
    // strandar den installerade appen annars på WebAPK:ns splash-skärm.
    // 1) Navigation API: avbryter traverseringen tyst (mest desktop-Chrome).
    // 2) Gest-armerad pushState-buffert: vid touch fylls historiken på med
    //    poster (märkta poppaDepth) upp till MAX_TRAP_DEPTH. Poster skapade
    //    MED gest respekteras av Chromes "history manipulation
    //    intervention", så varje bakåt kliver bara ner ett steg — tyst.
    //    Först på botten visas startskärmen och en sista fångstpost pushas.
    //    OBS: pusha aldrig i popstate annat än på botten.
    const MAX_TRAP_DEPTH = 8;
    let backTrapNeedsArm = true;

    if (window.navigation) {
        navigation.addEventListener('navigate', (e) => {
            if (e.navigationType === 'traverse' && e.cancelable) {
                e.preventDefault();
            }
        });
    }

    history.pushState(null, '', location.href); // grundfälla (utan gest)

    window.addEventListener('popstate', (e) => {
        backTrapNeedsArm = true;
        if (e.state && typeof e.state.poppaDepth === 'number') {
            return; // landade i bufferten — tyst, barnet poppar vidare
        }
        history.pushState(null, '', location.href);
        showStartOverlay();
    });

    document.addEventListener('pointerdown', () => {
        if (!backTrapNeedsArm) return;
        backTrapNeedsArm = false;
        let depth = (history.state && typeof history.state.poppaDepth === 'number')
            ? history.state.poppaDepth + 1 : 0;
        while (depth < MAX_TRAP_DEPTH) {
            history.pushState({ poppaDepth: depth }, '', location.href);
            depth++;
        }
    }, { capture: true, passive: true });

    // Lås orientering till landskap. Biter bara i helskärm eller installerad
    // app — nytt försök görs varje gång helskärm tas.
    function lockOrientation() {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    }
    lockOrientation();

    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            startOverlay.style.display = 'none';
            lockOrientation();
        } else if (!isInstalledApp()) {
            // Webbläsarläge: startskärmen är enda vägen tillbaka till
            // fullscreen. Installerad app återtar fullscreen tyst vid nästa touch.
            showStartOverlay();
        }
        setTimeout(applyLayout, 100);
    });

    // Installerad app: återta immersive fullscreen tyst vid touch om det
    // tappats (bakåt-tryck, skärmlåsning). Kräver användargest -> touchend.
    window.addEventListener('touchend', () => {
        if (isInstalledApp() && !document.fullscreenElement && document.fullscreenEnabled) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }, { passive: true });

    skyCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
    skyCanvas.addEventListener('mousedown', onMouseDown);

    // Blockera pinch-zoom på iOS (Safari ignorerar user-scalable=no).
    document.addEventListener('gesturestart', e => e.preventDefault());

    // Debounca layout-events till en omräkning per frame.
    let layoutPending = false;
    function debouncedLayout() {
        if (!layoutPending) {
            layoutPending = true;
            requestAnimationFrame(() => {
                applyLayout();
                layoutPending = false;
            });
        }
    }
    window.addEventListener('resize', debouncedLayout);
    window.addEventListener('orientationchange', debouncedLayout);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', debouncedLayout);
        window.visualViewport.addEventListener('scroll', debouncedLayout);
    }

    applyLayout();
    setTimeout(applyLayout, 50);
    // Säkerställ att det alltid finns ballonger på väg (t.ex. efter att
    // appen legat i bakgrunden).
    setInterval(fillUp, 2000);
    requestAnimationFrame(frame);

    // Registrera service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const nw = reg.installing;
                if (!nw) return;
                nw.addEventListener('statechange', () => {
                    if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                        window.location.reload();
                    }
                });
            });
        }).catch(() => {});
    }
});
