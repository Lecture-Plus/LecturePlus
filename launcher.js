/**
 * launcher.js — Lanceur portable (pkg)
 *
 * Principe : Node.js autonome (~50 MB) + Chrome/Edge du système.
 * Aucun Chromium embarqué → même moteur JS que votre Chrome habituel,
 * même cache V8, performances identiques à localhost.
 *
 * Flux :
 *   1. Démarre server.js sur localhost:8000
 *   2. Ouvre Chrome/Edge en mode "--app" (fenêtre sans barre d'URL)
 *   3. Quand la fenêtre est fermée → process.exit()
 *
 * Fallback : si ni Chrome ni Edge → ouvre le navigateur par défaut (start "")
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const { spawn, exec } = require('child_process');

const PORT = 8000;

// ── Trouve Chrome ou Edge installé sur la machine ─────────────────
function findBrowserExe() {
    const L   = process.env.LOCALAPPDATA          || '';
    const PF  = process.env.ProgramFiles          || 'C:\\Program Files';
    const P86 = process.env['ProgramFiles(x86)']  || 'C:\\Program Files (x86)';
    const candidates = [
        path.join(P86, 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(PF,  'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(PF,  'Google\\Chrome\\Application\\chrome.exe'),
        path.join(P86, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(L,   'Google\\Chrome\\Application\\chrome.exe'),
    ];
    for (const p of candidates) {
        try { fs.accessSync(p, fs.constants.F_OK); return p; } catch (_) {}
    }
    return null;
}

// ── Ouvre l'app dans le navigateur ───────────────────────────────
function launch() {
    const url     = `http://localhost:${PORT}`;
    const browser = findBrowserExe();

    if (!browser) {
        // Aucun Chrome/Edge : navigateur par défaut (barre d'URL visible)
        exec(`start "" "${url}"`);
        console.log(`Lecture+ : ${url}`);
        console.log('Fermez cette fenêtre pour arrêter le serveur.');
        return;
    }

    // Profil dédié à côté de l'exe (cache V8 persistant entre les lancements)
    const exeDir     = (process.pkg || process._isSea) ? path.dirname(process.execPath) : __dirname;
    const profileDir = path.join(exeDir, '.chrome-profile');

    // Taille de fenêtre : lire prefs.json si disponible, sinon valeur par défaut
    let winW = 1694, winH = 1073;
    try {
        const prefsPath = path.join(exeDir, 'prefs.json');
        if (fs.existsSync(prefsPath)) {
            const p = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
            if (p.windowWidth  > 400) winW = p.windowWidth;
            if (p.windowHeight > 300) winH = p.windowHeight;
        }
    } catch(_) {}

    const child = spawn(browser, [
        `--app=${url}`,
        `--user-data-dir=${profileDir}`,
        `--window-size=${winW},${winH}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-sync',
        '--disable-background-networking',
    ], { detached: false, stdio: 'ignore' });

    // Quand la fenêtre Chrome/Edge est fermée → arrêter le serveur
    child.on('close', () => process.exit(0));

    // Chrome introuvable au lancement → fallback navigateur par défaut
    child.on('error', () => {
        exec(`start "" "${url}"`);
        console.log(`Lecture+ : ${url}`);
    });
}

// ── Démarrer le serveur puis ouvrir le navigateur ────────────────
const httpServer = require('./server.js');

if (httpServer.listening) {
    launch();
} else {
    httpServer.on('listening', launch);
    httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            // Un serveur tourne déjà → ouvrir directement
            launch();
        } else {
            console.error('Erreur serveur :', err.message);
            process.exit(1);
        }
    });
}
