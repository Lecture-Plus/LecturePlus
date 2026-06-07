#!/usr/bin/env node
/**
 * build_lexique.js
 * Génère assets/lexique.js depuis assets/Lexique383.tsv
 *
 * Usage : node build_lexique.js
 * Sortie : assets/lexique.js — window.LEXIQUE = {"mot":"phon", ...}
 */
const fs   = require('fs');
const path = require('path');

const SOURCE = path.join('assets', 'Lexique383.tsv');
const OUTPUT = path.join('assets', 'lexique.js');

if (!fs.existsSync(SOURCE)) {
    console.error(`ERREUR : fichier introuvable : ${SOURCE}`);
    process.exit(1);
}

console.error('Lecture du TSV…');
const raw = fs.readFileSync(SOURCE, 'utf8');
const lines = raw.split('\n');

const header = lines[0].split('\t');
const col_ortho      = header.indexOf('ortho');
const col_phon       = header.indexOf('phon');
const col_freqlivres = header.indexOf('freqlivres');
const col_freqfilms  = header.indexOf('freqfilms2');

if (col_ortho < 0 || col_phon < 0) {
    console.error('ERREUR : colonnes ortho/phon introuvables');
    process.exit(1);
}

const lexique = {};  // ortho → phon
const freqs   = {};  // ortho → fréquence max

let n = 0;
for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const row = line.split('\t');
    if (row.length <= col_phon) continue;

    const ortho = row[col_ortho].trim();
    const phon  = row[col_phon].trim();

    if (!ortho || !phon) continue;
    if (ortho.includes(' ') || ortho.includes("'") || ortho.includes('\u2019')) continue;

    const fLivres = parseFloat(row[col_freqlivres]) || 0;
    const fFilms  = parseFloat(row[col_freqfilms])  || 0;
    const freq    = fLivres + fFilms;

    if (!(ortho in lexique) || freq > (freqs[ortho] || -1)) {
        lexique[ortho] = phon;
        freqs[ortho]   = freq;
    }
    n++;
}

const nEntries = Object.keys(lexique).length;
console.error(`Lignes lues     : ${n}`);
console.error(`Entrées uniques : ${nEntries}`);

const json = JSON.stringify(lexique);
const out  = `// Généré automatiquement par build_lexique.js — NE PAS ÉDITER\n// Source : ${SOURCE} — ${nEntries} entrées\nwindow.LEXIQUE=${json};\n`;

fs.writeFileSync(OUTPUT, out, 'utf8');
const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
console.error(`Écrit           : ${OUTPUT}  (${sizeKb} Ko)`);
