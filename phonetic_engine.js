/**
 * phonetic_engine.js — Moteur graphème/phonème pour lecture française
 * Utilise LireCouleur (assets/lirecouleur.min.js) pour l'extraction
 * phonémique, la syllabation et la détection des lettres muettes.
 *
 * Dépend de :
 *   - window.LireCouleur  (assets/lirecouleur.min.js)
 *   - window.REFERENTS    (défini dans index.html)
 *
 * Notation phonétique Lexique 3.83 (utilisée dans REFERENT_PHONEMES) :
 *   Voyelles orales  : a e E i o O u y  2(=ø) 9(=œ) °(=ə)
 *   Voyelles nasales : @(=ɑ̃) §(=ɔ̃) 5(=ɛ̃) 1(=œ̃)
 *   Semi-voyelles    : j w
 *   Consonnes        : b d f g k l m n p R S(=ʃ) t v z Z(=ʒ) N(=ɲ)
 */

// ═══════════════════════════════════════════════════════════════════
// LC_TO_LEX — Correspondance codes phonétiques LireCouleur → Lexique
// (les REFERENT_PHONEMES utilisent le système Lexique)
// ═══════════════════════════════════════════════════════════════════
const LC_TO_LEX = {
    // Voyelles orales
    'a':        'a',
    'e':        'e',
    'e_comp':   'e',
    'e^':       'E',
    'e^_comp':  'E',
    'i':        'i',
    'o':        'o',
    'o_comp':   'o',
    'o_ouvert': 'O',
    'u':        'u',
    'y':        'y',
    'x^':       '2',     // /ø/  eu fermé  (deux, feu)
    'x':        '9',     // /œ/  eu ouvert (leur, peur)
    'q':        '°',     // /ə/  schwa     (e de petit)
    'q_caduc':  '°',
    // Voyelles nasales
    'e~':       '5',     // /ɛ̃/  in, ain, ein, im
    'a~':       '@',     // /ɑ̃/  an, am, en, em
    'o~':       '§',     // /ɔ̃/  on, om
    'x~':       '1',     // /œ̃/  un, um
    // Semi-voyelles
    'j':        'j',
    'w':        'w',
    'wa':       'wa',
    'w5':       'w5',
    // Consonnes
    'p':        'p',
    't':        't',
    'k':        'k',
    'k_qu':     'k',
    'b':        'b',
    'd':        'd',
    'g':        'g',
    'g_u':      'g',
    'f':        'f',
    'f_ph':     'f',
    's':        's',
    's_c':      's',
    's_t':      's',
    'z':        'z',
    'z_s':      'z',
    's^':       'S',     // /ʃ/  ch
    'z^':       'Z',     // /ʒ/  j, ge
    'z^_g':     'Z',
    'g^':       'Z',
    'g~':       'N',     // /ŋ/  ng
    'n~':       'N',     // /ɲ/  gn
    'l':        'l',
    'r':        'R',
    'm':        'm',
    'n':        'n',
    'v':        'v',
    'ks':       'ks',
    'gz':       'gz',
    // Phonèmes muets
    '#':        '',
    '#_h_muet': '',
    'verb_3p':  '',
};

// q_caduc = "e caduc" (fin de mot : table, pelle…) — traité comme muet
// car l'enfant ne l'entend généralement pas
const LC_SILENT = new Set(['#', '#_h_muet', 'verb_3p', 'q_caduc']);

// ═══════════════════════════════════════════════════════════════════
// GP_FALLBACK_RULES — Règles de secours si LireCouleur échoue
// ═══════════════════════════════════════════════════════════════════
const GP_FALLBACK_RULES = (function () {
    const rules = [
        // ── 5 lettres ──────────────────────────────────────────────
        { g: 'ouill', p: ['uj'] },
        { g: 'euill', p: ['2j', '°j'] },
        // ── 4 lettres ──────────────────────────────────────────────
        { g: 'aill', p: ['aj'] },
        { g: 'eill', p: ['Ej'] },
        { g: 'ouil', p: ['uj'] },
        { g: 'euil', p: ['2j', '°j'] },
        // ── 3 lettres ──────────────────────────────────────────────
        { g: 'eau',  p: ['o'] },
        { g: 'oeu',  p: ['2', '°'] },
        { g: 'ein',  p: ['5'] },
        { g: 'ain',  p: ['5'] },
        { g: 'aim',  p: ['5'] },
        { g: 'oin',  p: ['w5'] },
        { g: 'ion',  p: ['j§'] },
        { g: 'ien',  p: ['j5', 'jE5', 'jE'] },
        { g: 'ail',  p: ['aj', 'j'] },
        { g: 'eil',  p: ['Ej'] },
        { g: 'ill',  p: ['ij', 'il', 'j'] }, // LC peut émettre 'j' seul pour i(j)+ll(#)
        { g: 'err',  p: ['ER'] },
        { g: 'ell',  p: ['El'] },
        { g: 'ess',  p: ['Es'] },
        { g: 'ett',  p: ['Et'] },
        { g: 'enn',  p: ['En', 'n'] },
        // ── 2 lettres ──────────────────────────────────────────────
        { g: 'ch',   p: ['S', 'k'] },
        { g: 'ph',   p: ['f'] },
        { g: 'gn',   p: ['N'] },
        { g: 'qu',   p: ['k'] },
        { g: 'gu',   p: ['g'] },
        { g: 'ge',   p: ['Z'] },
        { g: 'au',   p: ['o'] },
        { g: 'eu',   p: ['2', '9', '°'] },
        { g: 'ou',   p: ['u'] },
        { g: 'oi',   p: ['wa'] },
        { g: 'ai',   p: ['E', 'e'] },
        { g: 'ei',   p: ['E', 'e'] },
        { g: 'ay',   p: ['Ej', 'E'] },
        { g: 'oy',   p: ['waj', 'wa'] },
        { g: 'an',   p: ['@'] },
        { g: 'am',   p: ['@'] },
        { g: 'en',   p: ['@', 'En'] },
        { g: 'em',   p: ['@'] },
        { g: 'on',   p: ['§'] },
        { g: 'om',   p: ['§'] },
        { g: 'in',   p: ['5'] },
        { g: 'im',   p: ['5'] },
        { g: 'un',   p: ['1', '5'] },
        { g: 'um',   p: ['1', '5'] },
        { g: 'yn',   p: ['5'] },
        { g: 'ym',   p: ['5'] },
        { g: 'ss',   p: ['s'] },
        { g: 'cc',   p: ['k', 'ks'] },
        { g: 'ck',   p: ['k'] },
        { g: 'nn',   p: ['n'] },
        { g: 'mm',   p: ['m'] },
        { g: 'rr',   p: ['R'] },
        { g: 'ff',   p: ['f'] },
        { g: 'll',   p: ['l'] },
        { g: 'tt',   p: ['t'] },
        { g: 'pp',   p: ['p'] },
        { g: 'bb',   p: ['b'] },
        { g: 'dd',   p: ['d'] },
        { g: 'er',   p: ['e', 'ER'] },
        { g: 'ez',   p: ['e'] },
        { g: 'et',   p: ['e', 'E'] },
        { g: 'ec',   p: ['Ek'] },
        { g: 'el',   p: ['El', 'l'] },
        { g: 'es',   p: ['E', 's', ''] },
        { g: 'uy',   p: ['ij'] },
        // ── 1 lettre ───────────────────────────────────────────────
        { g: 'a',    p: ['a'] },
        { g: 'â',    p: ['a'] },
        { g: 'à',    p: ['a'] },
        { g: 'e',    p: ['e', 'E', '°', '2', ''] },
        { g: 'é',    p: ['e'] },
        { g: 'è',    p: ['E'] },
        { g: 'ê',    p: ['E'] },
        { g: 'ë',    p: ['E'] },
        { g: 'i',    p: ['i', 'j'] },
        { g: 'î',    p: ['i'] },
        { g: 'ï',    p: ['i'] },
        { g: 'o',    p: ['o', 'O'] },
        { g: 'ô',    p: ['o'] },
        { g: 'u',    p: ['y', 'u'] },
        { g: 'û',    p: ['y'] },
        { g: 'ù',    p: ['y'] },
        { g: 'ü',    p: ['y'] },
        { g: 'y',    p: ['i', 'j'] },
        { g: 'ç',    p: ['s'] },
        { g: 'b',    p: ['b', ''] },
        { g: 'c',    p: ['k', 's'] },
        { g: 'd',    p: ['d', ''] },
        { g: 'f',    p: ['f'] },
        { g: 'g',    p: ['g', 'Z'] },
        { g: 'h',    p: [''] },
        { g: 'j',    p: ['Z'] },
        { g: 'k',    p: ['k'] },
        { g: 'l',    p: ['l', ''] },
        { g: 'm',    p: ['m', ''] },
        { g: 'n',    p: ['n', ''] },
        { g: 'p',    p: ['p', ''] },
        { g: 'q',    p: ['k'] },
        { g: 'r',    p: ['R', ''] },
        { g: 's',    p: ['s', 'z', ''] },
        { g: 't',    p: ['t', 's', ''] },
        { g: 'v',    p: ['v'] },
        { g: 'w',    p: ['v', 'w'] },
        { g: 'x',    p: ['ks', 'gz', 'z', 's', ''] },
        { g: 'z',    p: ['z', ''] },
    ];
    return rules.sort((a, b) => b.g.length - a.g.length);
})();

// ═══════════════════════════════════════════════════════════════════
// REFERENT_PHONEMES — Phonèmes Lexique produits par chaque référent
// ═══════════════════════════════════════════════════════════════════
const REFERENT_PHONEMES = {
    'a_papa':           ['a'],
    'ai_fraise':        ['E', 'e'],
    'ail_rail':         ['aj', 'j'],
    'aill_medaille':    ['aj', 'j'],
    'am_ampoule':       ['@'],
    'an_maman':         ['@'],
    'an_main':          ['5'],  // ain de main = /ɛ̃/
    'au_jaune':         ['o'],
    'ay_crayon':        ['Ej', 'E'],
    'b_botte':          ['b'],
    'c_cerise':         ['s'],
    'c_cube':           ['k'],
    'cedilla':          ['s'],
    'ch_chat':          ['S'],
    'ch_chrono':        ['k'],
    'd_domino':         ['d'],
    'e_petit':          ['e', '°'],
    'e_acute':          ['e'],
    'e_grave':          ['E'],
    'e_circumflex':     ['E'],
    'e_diaeresis':      ['E'],
    'eau_bateau':       ['o'],
    'ec_bec':           ['Ek'],
    'ei_baleine':       ['E', 'e'],
    'eil_soleil':       ['Ej'],
    'eill_bouteille':   ['Ej'],
    'ein_peinture':     ['5'],
    'el_ciel':          ['El'],
    'ell_pelle':        ['El'],
    'em_temperature':   ['@'],
    'en_dent':          ['@'],
    'enn_eolienne':     ['En', 'n'],
    'er_boucher':       ['e'],
    'er_mer':           ['ER'],
    'err_terre':        ['ER'],
    'es_veste':         ['E', 'Es'],
    'ess_tresse':       ['Es'],
    'et_poulet':        ['E', 'e'], // poulet = /ɛ/ (e ouvert)
    'ett_lunettes':     ['Et'],
    'eu_deux':          ['2', '9', '°'],
    'euil_ecureuil':    ['2j', '9j', '°j'],
    'euill_feuille':    ['2j', '9j', '°j'],
    'ez_nez':           ['e'],
    'f_fusee':          ['f'],
    'g_gateau':         ['g'],
    'g_girafe':         ['Z'],
    'ge_pigeon':        ['Z'],
    'gn_montagne':      ['N'],
    'gu_guitare':       ['g'],
    'i_lit':            ['i'],
    'i_diaeresis':      ['i'],
    'ien_indien':       ['j5', 'jE5', 'jE'],
    'ill_fille':        ['ij'],
    'im_timbre':        ['5'],
    'in_sapin':         ['5'],
    'ion_avion':        ['j§'],
    'j_jupe':           ['Z'],
    'k_kangourou':      ['k'],
    'l_lavabo':         ['l'],
    'm_mur':            ['m'],
    'n_nid':            ['n'],
    'o_moto':           ['o', 'O'],
    'oeu_noeud':        ['2', '°'],
    'oi_roi':           ['wa'],
    'oin_point':        ['w5'],
    'om_trompette':     ['§'],
    'on_baton':         ['§'],
    'ou_loup':          ['u'],
    'ouil_fenouil':     ['uj'],
    'ouill_grenouille': ['uj'],
    'oy_noyau':         ['waj', 'wa'],
    'p_pirate':         ['p'],
    'ph_photo':         ['f'],
    'q_cinq':           ['k'],
    'qu_quatre':        ['k'],
    'r_rat':            ['R'],
    's_serpent':        ['s'],
    's_oiseaux':        ['z'],
    'ss_tasse':         ['s'],
    't_tomate':         ['t'],
    't_martien':        ['s'],
    'u_lune':           ['y'],
    'um_parfum':        ['1', '5'],
    'un_un':            ['1', '5'],
    'uy_tuyau':         ['ij'],
    'v_vache':          ['v'],
    'x_dix':            ['', 's'],
    'x_taxi':           ['ks', 'gz'],
    'x_xylophone':      ['gz', 'ks'],
    'y_stylo':          ['i', 'j'],
    'z_zebre':          ['z'],
};

// ═══════════════════════════════════════════════════════════════════
// _mergeMultiGraphemes — Fusionne les tokens LC adjacents dont les
// lettres combinées forment un graphème multi-lettres connu.
// Ex: LC donne [e(E), l(l), l(l)] → fusion → [ell(El)] pour "elle".
// Basé sur GP_FALLBACK_RULES (toujours disponible, sans dépendance externe).
// ═══════════════════════════════════════════════════════════════════
// Graphèmes multi-lettres triés du plus long au plus court (même ordre que GP_FALLBACK_RULES)
const MULTI_LETTER_GS = GP_FALLBACK_RULES.filter(r => r.g.length > 1).map(r => r.g);

// Lookup: graphème → phonèmes valides attendus (depuis GP_FALLBACK_RULES)
// Utilisé pour valider les fusions — ex: "an" est valide seulement si phonème = "@", pas "an"
const GP_VALID_PHONEMES = new Map(GP_FALLBACK_RULES.map(r => [r.g, r.p]));

function _mergeMultiGraphemes(tokens) {
    if (!MULTI_LETTER_GS.length) return tokens;
    const result = [];
    let i = 0;
    while (i < tokens.length) {
        let merged = false;
        for (const g of MULTI_LETTER_GS) {
            let combined = '', j = i;
            while (j < tokens.length && combined.length < g.length) combined += tokens[j++].grapheme;
            if (combined === g) {
                const slice = tokens.slice(i, j);
                const mergedPhon = slice.filter(t => !t.silent).map(t => t.phoneme).filter(Boolean).join('');
                // Ne fusionner que si le phonème combiné est phonétiquement valide pour ce graphème.
                // Ex: "a"(/a/) + "n"(/n/) → "an" ≠ "@" (son nasal) → pas de fusion (satané).
                //     "e"(/E/) + "ll"(/l/) → "El" ∈ ["El"] (ell de pelle) → fusion OK.
                const validPhons = GP_VALID_PHONEMES.get(g) || [];
                if (validPhons.includes(mergedPhon)) {
                    result.push({
                        letters:  slice.map(t => t.letters).join(''),
                        grapheme: g,
                        phoneme:  mergedPhon,
                        silent:   slice.every(t => t.silent),
                    });
                    i = j; merged = true; break;
                }
            }
        }
        if (!merged) { result.push(tokens[i]); i++; }
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════════
// lcAlignWord — Alignement via LireCouleur
// Retourne [{letters, grapheme, phoneme, silent}, ...]
// phoneme est en code Lexique (pour REFERENT_PHONEMES)
// ═══════════════════════════════════════════════════════════════════
function lcAlignWord(word, doMerge = true) {
    try {
        const phons = LireCouleur.extrairePhonemes(word, false);
        if (!phons || phons.length === 0) return gpFallback(word);
        const raw = phons.map(lcp => ({
            letters:  lcp.lettres,
            grapheme: lcp.lettres.toLowerCase(),
            phoneme:  (lcp.phoneme in LC_TO_LEX) ? LC_TO_LEX[lcp.phoneme] : '',
            silent:   LC_SILENT.has(lcp.phoneme),
        }));
        return doMerge ? _mergeMultiGraphemes(raw) : raw;
    } catch (e) {
        return gpFallback(word);
    }
}

// ═══════════════════════════════════════════════════════════════════
// lcGetSyllabes — Syllabation via LireCouleur
// Retourne un tableau de chaînes (["syl", "la", "be"])
// ═══════════════════════════════════════════════════════════════════
function lcGetSyllabes(word) {
    try {
        const phons = LireCouleur.extrairePhonemes(word, false);
        if (!phons || phons.length === 0) return [word];
        const syllabes = LireCouleur.extraireSyllabes(phons);
        return syllabes.map(s => s.phonemes.map(p => p.lettres).join(''));
    } catch (e) {
        return [word];
    }
}

// ═══════════════════════════════════════════════════════════════════
// gpFallback — Alignement de secours si LireCouleur échoue
// ═══════════════════════════════════════════════════════════════════
function gpFallback(word) {
    const tokens = [];
    let i = 0;
    const wl = word.toLowerCase();
    const n = wl.length;

    while (i < n) {
        let matched = false;
        for (const rule of GP_FALLBACK_RULES) {
            if (!wl.startsWith(rule.g, i)) continue;
            const p = rule.p[0];
            tokens.push({ letters: word.slice(i, i + rule.g.length), grapheme: rule.g, phoneme: p, silent: p === '' });
            i += rule.g.length;
            matched = true;
            break;
        }
        if (!matched) {
            tokens.push({ letters: word[i], grapheme: wl[i], phoneme: '?', silent: false });
            i++;
        }
    }
    return tokens;
}

// ═══════════════════════════════════════════════════════════════════
// _getRefIdx — Index statique graphème→référents (liste complète, construit une seule fois)
// La visibilité est gérée par CSS data-ref, pas par ce filtre.
// ═══════════════════════════════════════════════════════════════════
let _staticRefIdx = null;
function _getRefIdx(referents) {
    if (_staticRefIdx) return _staticRefIdx;
    _staticRefIdx = new Map();
    for (const r of referents) {
        const g = r.grapheme.toLowerCase();
        if (!_staticRefIdx.has(g)) _staticRefIdx.set(g, []);
        _staticRefIdx.get(g).push(r);
    }
    return _staticRefIdx;
}

// selectReferent — Choisit le meilleur référent pour (graphème, phonème) dans la liste complète
// Sélection basée sur le phonème (déterministe), visibilité gérée par CSS.
// ═══════════════════════════════════════════════════════════════════
function selectReferent(grapheme, phoneme, referents) {
    const idx = _getRefIdx(referents);
    const candidates = idx.get(grapheme.toLowerCase()) || [];
    if (!candidates.length) return null;
    // NOTE : on NE retourne PAS candidates[0] immédiatement pour un seul candidat —
    // le phonème doit correspondre sinon on affiche un mauvais référent
    // (ex: 'es' → /e/ dans "les" ne doit PAS donner es_veste qui est /ɛ/).

    // 1) Correspondance exacte du phonème
    for (const r of candidates) {
        const rPhons = REFERENT_PHONEMES[r.id] || [];
        if (rPhons.includes(phoneme)) return r;
    }
    // 2) LC émet le début d'un phonème composé — ex: 'E' pour 'eil' qui attend 'Ej'
    if (phoneme) {
        for (const r of candidates) {
            const rPhons = REFERENT_PHONEMES[r.id] || [];
            if (rPhons.some(rp => rp.startsWith(phoneme))) return r;
        }
    }
    // 3) Le phonème LC est un composant du phonème du référent
    //    ex: LC donne 'j' pour 'ill' → ill_fille attend 'ij' → 'ij'.includes('j') ✓
    //    ex: LC donne 'E' pour 'eil' quand le référent attend 'Ej' (couvert par niveau 2)
    if (phoneme) {
        for (const r of candidates) {
            const rPhons = REFERENT_PHONEMES[r.id] || [];
            if (rPhons.some(rp => rp.includes(phoneme))) return r;
        }
    }
    // 4) Dernier recours : uniquement si phonème vide/inconnu
    //    Si phonème connu sans correspondance → son non couvert, pas de référent
    if (!phoneme) return candidates[0];
    return null;
}



// ═══════════════════════════════════════════════════════════════════
// escHtml — Échapper le HTML
// ═══════════════════════════════════════════════════════════════════
function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════
// WORD_OVERRIDES — Alignement exact pour les formes que LireCouleur
// analyse incorrectement en isolation (mots grammaticaux, formes verbales).
// Clés en minuscules. Les lettres sont reconstruites avec la casse d'origine.
// ═══════════════════════════════════════════════════════════════════
const WORD_OVERRIDES = {
    // Formes du verbe "être" — LC traite st/s comme sons pleins hors contexte
    // "est" (il/elle est) = /ɛ/ — s et t silents
    'est': [
        { letters: 'e', grapheme: 'e', phoneme: 'E', silent: false },
        { letters: 's', grapheme: 's', phoneme: '',  silent: true  },
        { letters: 't', grapheme: 't', phoneme: '',  silent: true  },
    ],
    // "es" (tu es) = /ɛ/ — s silent
    'es': [
        { letters: 'e', grapheme: 'e', phoneme: 'E', silent: false },
        { letters: 's', grapheme: 's', phoneme: '',  silent: true  },
    ],
    // "fils" (enfant) = /fis/ — le 'l' est silencieux (sans référent, pas de style muette),
    // le 's' est prononcé (/s/) et reçoit un référent normal
    'fils': [
        { letters: 'f', grapheme: 'f', phoneme: 'f', silent: false },
        { letters: 'i', grapheme: 'i', phoneme: 'i', silent: false },
        { letters: 'l', grapheme: 'l', phoneme: '',  silent: true  },
        { letters: 's', grapheme: 's', phoneme: 's', silent: false },
    ],
};

// ═══════════════════════════════════════════════════════════════════
// NO_MUETTE_WORDS — Mots grammaticaux sur lesquels on n'affiche JAMAIS
// le soulignement "lettres muettes", même si l'option est activée.
// Les apostrophes elles-mêmes sont aussi exclues (noMuette:true sur apoToken).
// ═══════════════════════════════════════════════════════════════════
const NO_MUETTE_WORDS = new Set([
    'les','des','du','un','une','la','le','et','il','lui','est','es',
    "c'est","n'est","t'es","j'ai","qu'est",
    'fils',
]);

// ═══════════════════════════════════════════════════════════════════
// Caches word-level pour LireCouleur
// Évite de rappeler extrairePhonemes/extraireSyllabes pour le même mot
// Éviction FIFO : supprime l'entrée la plus ancienne quand plein
// ═══════════════════════════════════════════════════════════════════
const _lcAlignCache = new Map();
const _lcSylCache   = new Map();
const _WORD_CACHE_MAX = 3000;

function _lcAlign(word) {
    const hit = _lcAlignCache.get(word);
    if (hit !== undefined) return hit;

    const lowerWord = word.toLowerCase();
    let val;

    // 1) Surcharges pour mots spécifiques (formes verbales ambiguës hors contexte)
    const override = WORD_OVERRIDES[lowerWord];
    if (override) {
        val = [];
        let pos = 0;
        for (const tok of override) {
            val.push({
                letters:  word.slice(pos, pos + tok.letters.length),
                grapheme: tok.grapheme,
                phoneme:  tok.phoneme,
                silent:   tok.silent,
            });
            pos += tok.letters.length;
        }
    }

    // 2) Mots avec apostrophe (ex: "C'est", "l'enfant", "j'ai") :
    // L'apostrophe elle-même ne doit JAMAIS recevoir le style "lettre muette"
    // → noMuette:true sur l'apoToken.
    else if (word.indexOf("'") > 0) {
        const apoIdx = word.indexOf("'");
        if (apoIdx < word.length - 1) {
            const before = word.slice(0, apoIdx);
            const after  = word.slice(apoIdx + 1);
            const contextTokens = lcAlignWord(before + after[0]);
            const beforeTokens = [];
            let consumed = 0;
            for (const tok of contextTokens) {
                if (consumed >= before.length) break;
                beforeTokens.push(tok);
                consumed += tok.letters.length;
            }
            // noMuette:true → l'apostrophe n'est jamais soulignée en "muet"
            const apoToken = { letters: "'", grapheme: "'", phoneme: '', silent: true, noMuette: true };
            const afterTokens = _lcAlign(after);
            val = [...beforeTokens, apoToken, ...afterTokens];
        } else {
            val = lcAlignWord(word);
        }
    }

    // 3) Traitement normal par LireCouleur
    else {
        val = lcAlignWord(word);
    }

    // Appliquer noMuette:true sur tous les tokens silents des mots grammaticaux
    // → les lettres muettes de ces mots ne seront jamais soulignées
    if (NO_MUETTE_WORDS.has(lowerWord)) {
        val = val.map(t => t.silent ? { ...t, noMuette: true } : t);
    }

    if (_lcAlignCache.size >= _WORD_CACHE_MAX) _lcAlignCache.delete(_lcAlignCache.keys().next().value);
    _lcAlignCache.set(word, val);
    return val;
}

function _lcSyl(word) {
    const hit = _lcSylCache.get(word);
    if (hit !== undefined) return hit;
    // Pour les contractions avec apostrophe : syllabation séparée avant/après
    const apoIdx = word.indexOf("'");
    if (apoIdx > 0 && apoIdx < word.length - 1) {
        const before = word.slice(0, apoIdx);
        const after  = word.slice(apoIdx + 1);
        const sylBefore = lcGetSyllabes(before);
        const sylAfter  = lcGetSyllabes(after);
        // Réintégrer l'apostrophe dans la dernière syllabe du "before"
        const lastBefore = sylBefore[sylBefore.length - 1] + "'";
        const val = [...sylBefore.slice(0, -1), lastBefore, ...sylAfter];
        if (_lcSylCache.size >= _WORD_CACHE_MAX) _lcSylCache.delete(_lcSylCache.keys().next().value);
        _lcSylCache.set(word, val);
        return val;
    }
    const val = lcGetSyllabes(word);
    if (_lcSylCache.size >= _WORD_CACHE_MAX) _lcSylCache.delete(_lcSylCache.keys().next().value);
    _lcSylCache.set(word, val);
    return val;
}

// ═══════════════════════════════════════════════════════════════════
// renderMotPhon — Rendu HTML d'un mot entier avec le moteur phonétique
// Retourne { html: string, colorIdx: number }
// ═══════════════════════════════════════════════════════════════════
function renderMotPhon(word, opts, referents, colorIdx) {
    let hasRefs = false;

    if (opts.arcsSyllabiques) {
        // Mêmes tokens fusionnés que le mode linéaire → couleurs et référents identiques
        const tokens = _lcAlign(word);
        const syllabes = _lcSyl(word);
        let html = '';
        let tIdx = 0;

        for (const syl of syllabes) {
            let sylHtml = '';
            let sylLen = 0;
            while (tIdx < tokens.length && sylLen < syl.length) {
                const t = tokens[tIdx];
                const ref = t.silent ? null : selectReferent(t.grapheme, t.phoneme, referents);
                if (ref) hasRefs = true;
                sylHtml += _tokenSpan(t, ref, opts, colorIdx);
                if (!t.silent) colorIdx++;
                sylLen += t.letters.length;
                tIdx++;
            }
            html += `<span class="syllabe">${sylHtml}</span>`;
        }
        while (tIdx < tokens.length) {
            const t = tokens[tIdx];
            const ref = t.silent ? null : selectReferent(t.grapheme, t.phoneme, referents);
            if (ref) hasRefs = true;
            html += _tokenSpan(t, ref, opts, colorIdx);
            if (!t.silent) colorIdx++;
            tIdx++;
        }
        return { html, colorIdx, hasRefs };
    }

    // Rendu linéaire — avec fusion des graphèmes multi-lettres
    const tokens = _lcAlign(word);
    let html = '';
    for (const t of tokens) {
        const ref = t.silent ? null : selectReferent(t.grapheme, t.phoneme, referents);
        if (ref) hasRefs = true;
        html += _tokenSpan(t, ref, opts, colorIdx);
        if (!t.silent) colorIdx++;
    }
    return { html, colorIdx, hasRefs };
}

// ═══════════════════════════════════════════════════════════════════
// _tokenSpan — Génère le HTML d'un token
// Règle : chaque lettre est sa propre span .g (display:inline-block),
// même au sein d'un graphème multi-lettres → espacement uniforme.
// Pour les référents multi-lettres, la 1ʳᵉ lettre porte l'ancre (::before)
// et --g-n permet au CSS de centrer l'image sur tout le groupe.
// ═══════════════════════════════════════════════════════════════════
function _tokenSpan(token, referent, opts, colorIdx) {
    const letters = escHtml(token.letters);

    // ─ Avec référent : wrap .g-wrap (position:relative, inline-block)
    // La classe r-{id} est lue par les règles CSS statiques générées au démarrage.
    // Plus d'inline style --ref-img : CSS rule [data-ref="id"]{--ref-img:url(...)} → cache CSS natif.
    if (referent) {
        let wrapCls = `g-wrap has-ref r-${referent.id}`;
        if (opts.couleursAlternees && !token.silent) wrapCls += colorIdx % 2 === 0 ? ' c-rouge' : ' c-bleu';
        const innerSpans = token.letters.length === 1
            ? `<span class="g">${escHtml(token.letters)}</span>`
            : token.letters.split('').map(ch => `<span class="g">${escHtml(ch)}</span>`).join('');
        return `<span class="${wrapCls}" data-ref="${referent.id}">${innerSpans}</span>`;
    }

    // ─ Lettre muette (sans référent)
    // noMuette:true → ne jamais afficher le soulignement muet (apostrophes, mots grammaticaux)
    if (token.silent) return (opts.lettresMuettes && !token.noMuette) ? `<span class="muette">${letters}</span>` : letters;

    // ─ Couleurs alternées (sans référent) : 1 seul span
    if (opts.couleursAlternees) return `<span class="${colorIdx % 2 === 0 ? 'c-rouge' : 'c-bleu'}">${letters}</span>`;

    // ─ Texte brut : aucun span — 0 nœud DOM
    return letters;
}

// ═══════════════════════════════════════════════════════════════════
// transformTextPhon — Point d'entrée principal
// Transforme un texte entier en HTML annoté (remplace transformText)
// ═══════════════════════════════════════════════════════════════════
// Cache de mémoïsation : évite de recalculer le même texte + mêmes options
// LRU (2000 entrées) : éviction de la plus ancienne entrée, jamais de clear brutal
const _phonCache = new Map();
const _PHON_CACHE_MAX = 2000;

function transformTextPhon(text, elv, referents) {
    const opts      = elv.options;
    // Clé = texte + flags options uniquement — la visibilité des référents est gérée par CSS
    const flags = (opts.lettresMuettes    ? 1 : 0)
                | (opts.arcsSyllabiques   ? 2 : 0)
                | (opts.couleursAlternees ? 4 : 0)
                | (opts.espacementAjuste  ? 8 : 0);
    const key = text + '\x00' + flags;
    const hit = _phonCache.get(key);
    if (hit !== undefined) return hit;

    // Normalise les apostrophes typographiques (' ' ‛ `) en apostrophe droite '
    // pour que "C'est" soit traité comme "C'est" par LireCouleur
    const normalizedText = text.replace(/[\u2018\u2019\u201A\u201B\u0060]/g, "'");

    const SPLIT_RE = /(\s+|[.,;:!?«»""()\-–—\/\\0-9]+)/g;
    const TEST_RE  = /^[\s.,;:!?«»""()\-–—\/\\0-9]+$/;
    // Ponctuation "collante" qui doit rester attachée au mot qui la précède
    // (point, virgule, point-virgule, deux-points, !, ?, guillemets fermants, parenthèse fermante)
    const CLOSING_PUNCT_RE = /^[.,;:!?»")\]–—]+$/;
    const parts = normalizedText.split(SPLIT_RE);
    let colorIdx = 0;
    let out = '';

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        if (TEST_RE.test(part)) {
            out += escHtml(part);
            continue;
        }
        const r = renderMotPhon(part, opts, referents, colorIdx);
        const cls = r.hasRefs ? 'mot word-refs' : 'mot';
        // Regarder si le prochain élément est une ponctuation fermante sans espace avant
        // → si oui, l'englober dans le même span pour éviter qu'elle passe seule à la ligne
        const nextPart = parts[i + 1] || '';
        if (nextPart && CLOSING_PUNCT_RE.test(nextPart)) {
            out += `<span class="mot-punct"><span class="${cls}">${r.html}</span>${escHtml(nextPart)}</span>`;
            i++; // consommer la ponctuation
        } else {
            out += `<span class="${cls}">${r.html}</span>`;
        }
        colorIdx = r.colorIdx;
    }

    // LRU : éviction FIFO de la plus ancienne entrée — jamais de clear brutal
    if (_phonCache.size >= _PHON_CACHE_MAX) _phonCache.delete(_phonCache.keys().next().value);
    _phonCache.set(key, out);
    return out;
}
