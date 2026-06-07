/**
 * phonetic_worker.js — Web Worker pour le calcul phonétique
 *
 * Architecture : le thread principal envoie des demandes de transformation,
 * le worker répond avec le HTML calculé. Le main thread reste à 60fps.
 *
 * C'est la même technique que :
 *  - VS Code    : TypeScript language service dans un worker
 *  - Figma      : moteur de rendu dans un worker (WASM)
 *  - Google Maps: calcul des tuiles dans des workers
 *  - Gmail      : indexation de recherche dans un worker
 *
 * Messages reçus :
 *   { type: 'init',      payload: { referents: [...] } }
 *   { type: 'transform', payload: { asyncId, blocId, text, options } }
 *
 * Messages émis :
 *   { type: 'ready' }
 *   { type: 'result', payload: { asyncId, blocId, html } }
 */

// Charger LireCouleur puis le moteur phonétique (caches inclus)
importScripts('./assets/lirecouleur.min.js', './phonetic_engine.js');

let _refs = null;

self.onmessage = function ({ data: { type, payload } }) {
    // ── Initialisation : réception des 93 référents
    if (type === 'init') {
        _refs = payload.referents;
        self.postMessage({ type: 'ready' });
        return;
    }

    // ── Transformation d'un bloc texte
    if (type === 'transform') {
        const { asyncId, blocId, text, options } = payload;
        const fakeElv = { options };

        // Même logique que renderBlocRow côté main thread
        const lines = (text || '').split('\n').filter(l => l.trim());
        let html;
        if (lines.length <= 1) {
            html = text.trim() ? transformTextPhon(text.trim(), fakeElv, _refs) : '';
        } else {
            html = lines.map(l =>
                `<div class="output-bloc-para">${transformTextPhon(l, fakeElv, _refs)}</div>`
            ).join('');
        }

        self.postMessage({ type: 'result', payload: { asyncId, blocId, html } });
    }
};
