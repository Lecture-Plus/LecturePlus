const http   = require('http');
const net    = require('net');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');
const { spawn } = require('child_process');

const PORT = 8000;

// ROOT : dossier contenant les fichiers statiques à servir.
// - process.pkg    : compilé avec @yao-pkg/pkg
// - process._isSea : compilé avec Node.js Single Executable Application
// - sinon          : développement normal
const ROOT = (process.pkg || process._isSea)
    ? path.dirname(process.execPath)
    : __dirname;

// ── Stockage temporaire des pages HTML servies au navigateur headless
const tempPages = new Map();

// ── Détection de Chrome / Edge installé sur la machine
function findBrowserExe() {
    const LOCALAPPDATA   = process.env.LOCALAPPDATA || '';
    const PROGRAMFILES   = process.env.ProgramFiles  || 'C:\\Program Files';
    const PROGRAMFILES86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const candidates = [
        path.join(PROGRAMFILES86, 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(PROGRAMFILES,   'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(PROGRAMFILES,   'Google\\Chrome\\Application\\chrome.exe'),
        path.join(PROGRAMFILES86, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(LOCALAPPDATA,   'Google\\Chrome\\Application\\chrome.exe'),
    ];
    for (const p of candidates) {
        try { fs.accessSync(p, fs.constants.F_OK); return p; } catch (_) {}
    }
    return null;
}

// ── Client WebSocket minimal pour le CDP Chrome
function wsConnect(wsUrl) {
    return new Promise(function(resolve, reject) {
        var u        = new URL(wsUrl);
        var key      = crypto.randomBytes(16).toString('base64');
        var sock     = net.createConnection(parseInt(u.port) || 80, u.hostname);
        var upgraded = false;
        var rbuf     = Buffer.alloc(0);
        var msgId    = 1;
        var pending  = new Map();
        var onEvent  = null;

        function sendText(text) {
            var payload = Buffer.from(text, 'utf8');
            var mask    = crypto.randomBytes(4);
            var hdr;
            if (payload.length < 126)        hdr = [0x81, 0x80 | payload.length];
            else if (payload.length < 65536) hdr = [0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff];
            else                             hdr = [0x81, 0x80 | 127, 0,0,0,0, (payload.length>>>24)&0xff, (payload.length>>>16)&0xff, (payload.length>>>8)&0xff, payload.length&0xff];
            var masked = Buffer.allocUnsafe(payload.length);
            for (var i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
            sock.write(Buffer.concat([Buffer.from(hdr), mask, masked]));
        }

        var ws = {
            send: function(method, params) {
                var id = msgId++;
                sendText(JSON.stringify({ id: id, method: method, params: params || {} }));
                return new Promise(function(res, rej) { pending.set(id, { res: res, rej: rej }); });
            },
            setEventHandler: function(fn) { onEvent = fn; },
            close: function() { try { sock.destroy(); } catch(_) {} }
        };

        sock.on('connect', function() {
            sock.write('GET ' + u.pathname + ' HTTP/1.1\r\nHost: ' + u.host + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
        });

        sock.on('data', function(chunk) {
            rbuf = Buffer.concat([rbuf, chunk]);
            if (!upgraded) {
                var sep = rbuf.indexOf('\r\n\r\n');
                if (sep === -1) return;
                upgraded = true;
                rbuf = rbuf.slice(sep + 4);
                resolve(ws);
            }
            while (rbuf.length >= 2) {
                var b1     = rbuf[1];
                var isMask = (b1 & 0x80) !== 0;
                var plen   = b1 & 0x7f;
                var off    = 2;
                if (plen === 126) { if (rbuf.length < 4) break; plen = rbuf.readUInt16BE(2); off = 4; }
                else if (plen === 127) { if (rbuf.length < 10) break; plen = rbuf.readUInt32BE(6); off = 10; }
                var total = off + (isMask ? 4 : 0) + plen;
                if (rbuf.length < total) break;
                var payload = rbuf.slice(off + (isMask ? 4 : 0), total);
                if (isMask) {
                    var m = rbuf.slice(off, off + 4);
                    var unmasked = Buffer.allocUnsafe(payload.length);
                    for (var j = 0; j < payload.length; j++) unmasked[j] = payload[j] ^ m[j % 4];
                    payload = unmasked;
                }
                rbuf = rbuf.slice(total);
                try {
                    var msg = JSON.parse(payload.toString('utf8'));
                    if (msg.id !== undefined && pending.has(msg.id)) {
                        var cb = pending.get(msg.id); pending.delete(msg.id);
                        if (msg.error) cb.rej(new Error(msg.error.message || JSON.stringify(msg.error)));
                        else cb.res(msg.result);
                    } else if (msg.method && onEvent) {
                        onEvent(msg);
                    }
                } catch(_) {}
            }
        });

        sock.on('error', function(err) { if (!upgraded) reject(err); });
        setTimeout(function() { if (!upgraded) { sock.destroy(); reject(new Error('WS connect timeout')); } }, 5000);
    });
}

// ── Chrome persistant (warm) via CDP — coût de démarrage payé une seule fois
var CDP_PORT     = 19222;
var _cdp         = null; // { proc, ready }
var _cdpRestarts = 0;

function startPersistentChrome() {
    var browser = findBrowserExe();
    if (!browser) return;
    var profileDir = path.join(os.tmpdir(), 'lp_chrome_cdp');
    var proc = spawn(browser, [
        '--headless', '--disable-gpu', '--no-sandbox',
        '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--no-default-browser-check',
        '--disable-sync', '--disable-background-networking',
        '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profileDir,
    ], { windowsHide: true });
    _cdp = { proc: proc, ready: false };
    proc.on('exit', function() {
        _cdp = null;
        _warmTab = null;
        _warmTabBusy = false;
        if (_cdpRestarts < 5) {
            _cdpRestarts++;
            console.log('[PDF] Chrome CDP arrêté, redémarrage (' + _cdpRestarts + '/5)…');
            setTimeout(startPersistentChrome, 1500);
        }
    });
    proc.on('error', function() { _cdp = null; _warmTab = null; _warmTabBusy = false; });
    // Attendre que Chrome écoute sur le port CDP
    var attempts = 0;
    var poll = setInterval(function() {
        if (attempts++ > 150) { clearInterval(poll); return; } // 30s max
        http.get('http://127.0.0.1:' + CDP_PORT + '/json/version', function(r) {
            r.resume();
            if (_cdp) { _cdp.ready = true; clearInterval(poll); console.log('[PDF] Chrome CDP prêt.');
                createWarmTab(null); // préchauffer l'onglet immédiatement
            }
        }).on('error', function() {});
    }, 200);
}

// ── Onglet CDP persistant — réutilisé pour chaque génération PDF
var _warmTab      = null;   // { ws, id }
var _warmTabBusy  = false;
var _warmTabQueue = [];     // file d'attente : [{ html, resolve, reject }]

function createWarmTab(cb) {
    var req = http.request({
        hostname: '127.0.0.1', port: CDP_PORT,
        path: '/json/new', method: 'PUT'
    }, function(r) {
        var body = '';
        r.on('data', function(d) { body += d; });
        r.on('end', function() {
            var target;
            try {
                var jsonStart = body.indexOf('{');
                if (jsonStart === -1) throw new Error('Pas de JSON : ' + body.slice(0, 80));
                target = JSON.parse(body.slice(jsonStart));
            } catch(e) { console.error('[PDF] createWarmTab JSON:', e.message); if (cb) cb(e); return; }
            wsConnect(target.webSocketDebuggerUrl).then(function(ws) {
                return ws.send('Page.enable').then(function() {
                    _warmTab = { ws: ws, id: target.id };
                    console.log('[PDF] Onglet chaud prêt.');
                    if (cb) cb(null);
                    processWarmTabQueue();
                });
            }).catch(function(e) { if (cb) cb(e); });
        });
    }).on('error', function(e) { console.error('[PDF] createWarmTab error:', e.message); if (cb) cb(e); });
    req.end();
}

function processWarmTabQueue() {
    if (_warmTabBusy || !_warmTabQueue.length || !_warmTab) return;
    _warmTabBusy = true;
    var item = _warmTabQueue.shift();
    runPdfOnWarmTab(item.html, item.resolve, item.reject);
}

function runPdfOnWarmTab(html, resolve, reject) {
    var ws  = _warmTab.ws;
    var t0  = Date.now();

    // Stocker le HTML dans tempPages et naviguer vers /temp/id (Page.setContent non supporté par Edge)
    var id = crypto.randomBytes(8).toString('hex');
    tempPages.set(id, html);
    var url = 'http://localhost:' + PORT + '/temp/' + id;

    var timer = setTimeout(function() {
        console.error('[PDF] Timeout — invalidation de l\'onglet chaud');
        tempPages.delete(id);
        _warmTab = null; _warmTabBusy = false;
        reject(new Error('Timeout CDP PDF'));
        if (_cdp && _cdp.ready) createWarmTab(null);
        processWarmTabQueue();
    }, 30000);

    var done = false;
    // Fallback 5s si loadEventFired ne se déclenche pas
    var fallback = setTimeout(function() {
        if (!done) { done = true; console.log('[PDF] fallback après ' + (Date.now()-t0) + 'ms'); doPrint(); }
    }, 5000);

    ws.setEventHandler(function(msg) {
        if (!done && msg.method === 'Page.loadEventFired') {
            done = true;
            clearTimeout(fallback);
            console.log('[PDF] loadEventFired ' + (Date.now()-t0) + 'ms');
            doPrint();
        }
    });

    console.log('[PDF] navigate ' + Math.round(html.length/1024) + 'KB…');
    ws.send('Page.navigate', { url: url }).catch(function(err) {
        clearTimeout(timer); clearTimeout(fallback);
        tempPages.delete(id);
        _warmTab = null; _warmTabBusy = false;
        reject(err);
        if (_cdp && _cdp.ready) createWarmTab(null);
        processWarmTabQueue();
    });

    function doPrint() {
        tempPages.delete(id);
        var t1 = Date.now();
        ws.send('Page.printToPDF', {
            printBackground: true, preferCSSPageSize: true,
            // 68px à 96dpi = 0.7083" | 60px à 96dpi = 0.625"
            marginTop: 0.7083, marginBottom: 0.7083, marginLeft: 0.625, marginRight: 0.625,
        }).then(function(result) {
            clearTimeout(timer);
            console.log('[PDF] printToPDF ' + (Date.now()-t1) + 'ms | total ' + (Date.now()-t0) + 'ms');
            _warmTabBusy = false;
            resolve(Buffer.from(result.data, 'base64'));
            processWarmTabQueue();
        }).catch(function(err) {
            clearTimeout(timer);
            _warmTab = null; _warmTabBusy = false;
            reject(err);
            if (_cdp && _cdp.ready) createWarmTab(null);
            processWarmTabQueue();
        });
    }
}

// ── Génère un PDF via CDP (onglet persistant)
function htmlToPdfCDP(html) {
    return new Promise(function(resolve, reject) {
        _warmTabQueue.push({ html: html, resolve: resolve, reject: reject });
        if (_warmTab) {
            processWarmTabQueue();
        } else {
            // Onglet pas encore créé — le créer puis processWarmTabQueue sera appelé dans le callback
            createWarmTab(function(err) {
                if (err) {
                    var idx = _warmTabQueue.findIndex(function(i) { return i.resolve === resolve; });
                    if (idx >= 0) _warmTabQueue.splice(idx, 1);
                    reject(err);
                }
            });
        }
    });
}

// ── Ancienne méthode (spawn Chrome) — fallback si CDP non disponible
function htmlToPdfSpawn(html) {
    return new Promise(function(resolve, reject) {
        var browser = findBrowserExe();
        if (!browser) {
            reject(new Error(
                'Chrome ou Edge introuvable sur ce PC.\n' +
                'Installez Google Chrome ou Microsoft Edge pour générer des PDFs.'
            ));
            return;
        }

        var id         = crypto.randomBytes(8).toString('hex');
        var pdfPath    = path.join(os.tmpdir(), 'lecture_plus_' + id + '.pdf');
        var profileDir = path.join(os.tmpdir(), 'lp_chrome_' + id);

        tempPages.set(id, html);

        var url  = 'http://localhost:' + PORT + '/temp/' + id;
        var args = [
            '--headless', '--disable-gpu', '--no-sandbox',
            '--disable-dev-shm-usage', '--disable-extensions',
            '--run-all-compositor-stages-before-draw',
            '--virtual-time-budget=10000',
            '--user-data-dir=' + profileDir,
            '--print-to-pdf=' + pdfPath,
            '--no-pdf-header-footer',
            url,
        ];

        var proc  = spawn(browser, args, { windowsHide: true });
        var timer = setTimeout(function() {
            proc.kill('SIGKILL');
            reject(new Error('Timeout : la génération PDF a pris trop de temps (>60s).'));
        }, 60000);

        proc.on('close', function() {
            clearTimeout(timer);
            tempPages.delete(id);
            try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
            if (fs.existsSync(pdfPath)) {
                var buf = fs.readFileSync(pdfPath);
                try { fs.unlinkSync(pdfPath); } catch (_) {}
                resolve(buf);
            } else {
                reject(new Error('Le navigateur headless n\'a pas produit de fichier PDF.'));
            }
        });

        proc.on('error', function(err) {
            clearTimeout(timer);
            tempPages.delete(id);
            reject(new Error('Impossible de lancer le navigateur : ' + err.message));
        });
    });
}

// ── Point d'entrée : CDP si dispo, sinon spawn
function htmlToPdf(html) {
    if (_cdp && _cdp.ready) {
        return htmlToPdfCDP(html).catch(function(err) {
            console.warn('[PDF] CDP échoué, fallback spawn :', err.message);
            return htmlToPdfSpawn(html);
        });
    }
    return htmlToPdfSpawn(html);
}

// ── Serveur HTTP
var server = http.createServer(function(req, res) {
    var cors = { 'Access-Control-Allow-Origin': '*' };

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, Object.assign({}, cors, {
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type',
        }));
        res.end();
        return;
    }

    // ── Page HTML temporaire pour le navigateur headless
    if (req.method === 'GET' && req.url.startsWith('/temp/')) {
        var id   = req.url.slice(6).split('?')[0];
        var html = tempPages.get(id);
        if (html) {
            res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, cors));
            res.end(html);
        } else {
            res.writeHead(404, cors);
            res.end('Not found');
        }
        return;
    }

    // ── Préférences fenêtre ──────────────────────────────────────────────────
    // POST /api/prefs  { windowWidth, windowHeight }  → écrit prefs.json
    // GET  /api/prefs                                  → renvoie prefs.json
    if (req.method === 'GET' && req.url === '/api/prefs') {
        try {
            var p = path.join(ROOT, 'prefs.json');
            var data = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '{}';
            res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
            res.end(data);
        } catch(e) { res.writeHead(200, cors); res.end('{}'); }
        return;
    }
    if (req.method === 'POST' && req.url === '/api/prefs') {
        var body = '';
        req.on('data', function(c) { body += c; if (body.length > 1e4) req.destroy(); });
        req.on('end', function() {
            try {
                var prefs = JSON.parse(body);
                if (typeof prefs.windowWidth  !== 'number') throw new Error('bad');
                if (typeof prefs.windowHeight !== 'number') throw new Error('bad');
                fs.writeFileSync(path.join(ROOT, 'prefs.json'), JSON.stringify(prefs), 'utf8');
                res.writeHead(200, cors); res.end('ok');
            } catch(e) { res.writeHead(400, cors); res.end('bad request'); }
        });
        return;
    }

    // ── Sauvegarde journalière ────────────────────────────────────────────────
    // POST /api/save/write  { date, data }  → écrit save/YYYY-MM-DD.json
    //                                          max 4 fichiers, supprime le plus ancien
    // GET  /api/save/list                   → renvoie la liste des sauvegardes
    if (req.method === 'GET' && req.url === '/api/save/list') {
        var saveDir = path.join(ROOT, 'save');
        try {
            if (!fs.existsSync(saveDir)) { res.writeHead(200, cors); res.end('[]'); return; }
            var files = fs.readdirSync(saveDir)
                .filter(function(f) { return /^\d{4}-\d{2}-\d{2}\.json$/.test(f); })
                .sort();
            res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
            res.end(JSON.stringify(files));
        } catch(e) {
            res.writeHead(500, cors); res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    if (req.method === 'POST' && req.url === '/api/save/write') {
        var body = '';
        req.on('data', function(c) { body += c; if (body.length > 20e6) req.destroy(); });
        req.on('end', function() {
            try {
                var payload = JSON.parse(body);
                var dateStr = payload.date; // 'YYYY-MM-DD'
                if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    res.writeHead(400, cors); res.end('bad date'); return;
                }
                var saveDir = path.join(ROOT, 'save');
                if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

                // Supprimer les plus anciens si on dépasse 4 fichiers
                var existing = fs.readdirSync(saveDir)
                    .filter(function(f) { return /^\d{4}-\d{2}-\d{2}\.json$/.test(f); })
                    .sort();
                while (existing.length >= 4) {
                    fs.unlinkSync(path.join(saveDir, existing.shift()));
                }

                var filePath = path.join(saveDir, dateStr + '.json');
                fs.writeFileSync(filePath, JSON.stringify(payload.data, null, 2), 'utf8');
                res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
                res.end(JSON.stringify({ ok: true, file: dateStr + '.json' }));
            } catch(e) {
                res.writeHead(500, cors); res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // ── Endpoint génération PDF
    if (req.method === 'POST' && req.url === '/api/pdf') {
        var body = '';
        req.on('data', function(chunk) {
            body += chunk;
            if (body.length > 20e6) { req.destroy(); }
        });
        req.on('end', function() {
            var parsed;
            try { parsed = JSON.parse(body); } catch(e) {
                res.writeHead(400, cors); res.end('Bad JSON'); return;
            }
            if (!parsed.html || typeof parsed.html !== 'string') {
                res.writeHead(400, cors); res.end('Missing html'); return;
            }
            htmlToPdf(parsed.html).then(function(pdfBuf) {
                res.writeHead(200, Object.assign({
                    'Content-Type': 'application/pdf',
                    'Content-Length': pdfBuf.length,
                }, cors));
                res.end(pdfBuf);
            }).catch(function(err) {
                console.error('[/api/pdf]', err.message);
                res.writeHead(500, Object.assign({ 'Content-Type': 'application/json' }, cors));
                res.end(JSON.stringify({ error: err.message }));
            });
        });
        return;
    }

    // ── Fichiers statiques
    var urlPath = req.url === '/' ? 'index.html' : req.url;
    urlPath = urlPath.split('?')[0];
    urlPath = decodeURIComponent(urlPath);

    var filePath = path.join(ROOT, urlPath);

    // Protection traversée de répertoire
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.writeHead(403, cors);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, function(err, data) {
        if (err) {
            console.error('404: ' + urlPath);
            res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, cors));
            res.end('404 Not Found');
            return;
        }

        var ext = path.extname(filePath).toLowerCase();
        var contentTypes = {
            '.html': 'text/html',
            '.js':   'application/javascript',
            '.css':  'text/css',
            '.tsv':  'text/plain',
            '.svg':  'image/svg+xml',
            '.otf':  'font/otf',
            '.pdf':  'application/pdf',
        };

        // Cache-Control : no-cache + ETag → le navigateur valide TOUJOURS avec le serveur.
        // Exception : les SVG référents sont des assets immuables → max-age 1h (élimine 93+ requêtes HTTP au 2e chargement).
        var cacheHeaders = {};
        var isReferentSvg = ext === '.svg' && filePath.includes(path.sep + 'referents' + path.sep);
        if (isReferentSvg) {
            cacheHeaders['Cache-Control'] = 'max-age=3600, immutable';
        } else if (ext === '.js' || ext === '.css' || ext === '.otf' || ext === '.svg') {
            var stat = fs.statSync(filePath);
            var etag = stat.mtime.getTime().toString(36) + '-' + stat.size.toString(36);
            cacheHeaders['Cache-Control'] = 'no-cache';
            cacheHeaders['ETag'] = etag;
            // Répondre 304 Not Modified si le client a déjà la bonne version
            if (req.headers['if-none-match'] === etag) {
                res.writeHead(304, cors);
                res.end();
                return;
            }
        }

        res.writeHead(200, Object.assign({
            'Content-Type': contentTypes[ext] || 'application/octet-stream',
        }, cors, cacheHeaders));
        res.end(data);
    });
});

server.listen(PORT, function() {
    console.log('\n=== Serveur démarré ===');
    console.log('Ouvrez : http://localhost:' + PORT);
    console.log('Navigateur PDF : ' + (findBrowserExe() || 'ATTENTION : Chrome/Edge non détecté'));
    console.log('Appuyez sur Ctrl+C pour arrêter\n');
    startPersistentChrome();
});

module.exports = server;
