/*
 * lirecouleur.js est le moteur de décodage d'un texte en phonèmes et en syllabes.
 * Ce module fait partie du projet LireCouleur - http://lirecouleur.arkaline.fr
 * 
 * @author Marie-Pierre Brungard
 * @version 1.3
 * @since 2020
 *
 * GNU General Public Licence (GPL) version 3
  */

/*
 * Élimine les caractères accentués et les remplace par des non accentués
 */
function chaine_sans_accent(str) {
    const TabSpec = { "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o", "è": "e", "é": "e", "ê": "e", "ë": "e", "ç": "c", "ì": "i", "í": "i", "î": "i", "ï": "i", "ù": "u", "ú": "u", "û": "u", "ü": "u", "ÿ": "y", "ñ": "n" };

    const reg = /[àáäâèéêëçìíîïòóôõöøùúûüÿñ_-]/i;
    return str.replace(reg, function () { return TabSpec[arguments[0].toLowerCase()]; }).toLowerCase();
}

/*
 * Clone un tableau
 */
function clone_tableau(tab) {
    return tab.slice(0);
};

/*
 * Correspondance entre l'alphabet phonétique international et le code LireCouleur
 * référence : https://usito.usherbrooke.ca/articles/annexes/alphabetPhonétiqueInternational
 */
const alphabetPhonetique = {
    'p': 'p', 'b': 'b', 't': 't', 'd': 'd', 'k': 'k', 'k_qu': 'k', 'g': 'g', 'g_u': 'g',
    'f': 'f', 'f_ph': 'f', 'v': 'v', 's': 's', 's_c': 's', 's_t': 's', 'z': 'z', 'z_s': 'z',
    's^': 'ʃ', 'z^': 'ʒ', 'z^_g': 'ʒ', 'g^': 'ʒ', 'j': 'j', 'm': 'm', 'n': 'n', 'g~': 'ŋ',
    'n~': 'ɲ', 'l': 'l', 'r': 'ʁ', 'wa': 'wa', 'w5': 'wɛ̃', 'w': 'w', 'y': 'y', 'i': 'i',
    'e': 'e', 'e_comp': 'e', 'e^': 'ɛ', 'e^_comp': 'ɛ', 'a': 'a', 'o': 'o', 'o_ouvert': 'ɔ',
    'o_comp': 'o', 'u': 'u', 'y': 'y', 'x^': 'ø', 'x': 'œ', 'q': 'ə', 'q_caduc': 'ə',
    'e~': 'ɛ̃', 'a~': 'ã', 'o~': 'ɔ̃', 'x~': 'œ̃', 'ks': 'ks', 'gz': 'gz',
};

/********************************************************************************************************
 ********************************************************************************************************
 *
 *	Cette partie du code est destinée au traitement des textes pour en extraires des
 *	phonèmes et des syllabes.
 *
 ********************************************************************************************************
 ********************************************************************************************************/
/*
 * Les phonèmes sont codés en voyelles (v), consonnes (c) et semi-voyelles (s)
 */
const syllaphon = { "v": ["a", "q", "q_caduc", "i", "o", "o_comp", "o_ouvert", "u", "y", "e", "e_comp", "e^", "e^_comp", "a~", "e~", "x~", "o~", "x", "x^", "wa", "w5"], "c": ["p", "t", "k", "b", "d", "g", "f", "f_ph", "s", "s^", "v", "z", "z^", "l", "r", "m", "n", "k_qu", "z^_g", "g_u", "s_c", "s_t", "z_s", "ks", "gz"], "s": ["j", "g~", "n~", "w"], "#": ["#", "#_h_muet", "verb_3p"] };

/*
 * Code un phonème
 */
class LCPhoneme {
    constructor(phon, lett) {
        this.phoneme = phon;
        this.lettres = lett;
    }

    estPhoneme() {
        return (this.phoneme !== null);
    }

    estUneConsonne() {
        return (syllaphon['c'].indexOf(this.phoneme) > -1);
    }

    estUneVoyelle() {
        return (syllaphon['v'].indexOf(this.phoneme) > -1);
    }

    estSemiConsonne() {
        // yod+voyelle, 'w'+voyelle, 'y'+voyelle sans diérèse
        let p0 = this.phoneme[0];
        if (this.phoneme[1] == '_') {
            return ((p0 == 'j') || (p0 == 'w') || (p0 == 'y'));
        }
        return false;
    }

    estPhonemeMuet() {
        return (syllaphon['#'].indexOf(this.phoneme) > -1);
    }

    estSemiVoyelle() {
        return (syllaphon['s'].indexOf(this.phoneme) > -1);
    }

    estConsonneRedoublee() {
        return (this.estPhoneme() && (this.estUneConsonne() || this.estSemiConsonne()) && (this.lettres.length == 2) && (this.lettres[0] == this.lettres[1]));
    }

    dedoublerConsonnes() {
        this.lettres = this.lettres[0];
    }
}

/*
 * Code une syllabe
 */
class LCSyllabe {
    constructor() {
        this.phonemes = new Array();
    }

    ajoutePhonemes(a, phon) {
        let moi = this;
        if (typeof (phon) === "undefined") {
            a.forEach(function (element, index, array) {
                moi.phonemes.push(element);
            });
        }
        else {
            if (a instanceof Array) {
                a.forEach(function (element, index, array) {
                    moi.phonemes.push(phon[element]);
                });
            }
            else {
                this.phonemes.push(phon[a]);
            }
        }
    }
}

/*
 * Alphabet phonétique ascii : voir http://www.icp.inpg.fr/ICP/avtts/phon.fr.html
 * Outil inestimable : http://www.lexique.org/shiny/openlexicon/
 */

class LireCouleur {
    /*
     * Ensemble des règles d'extraction des phonèmes
     * '*' signifie 'suivi par n'importe quelle lettre
     * '@' signifie 'dernière lettre du mot
     *
     * format de l'automate:
     *		'lettre': [[règles par ordre prioritaire de déclenchement],[liste des règles]]
     *
     * 	ATTENTION. Il faut faire attention à l'ordre de précédence des règles. Plusieurs règles peuvent
     *	en effet s'appliquer pour une même succession de lettres. Il faut ranger les règles de la plus
     *	spécifique à la plus générale.
     *
     * format d'une règle :
     *		'nom_de_la_regle': [motif, phoneme, pas]
     *
     *	motif : il s'agit d'une expression régulière qui sert à tester les successions de lettres qui suivent
     *		la lettre en cours de traitement dans le mot et les successions de lettres qui précèdent la lettre
     *		en cours de traitement.
     *	phoneme : le nom du phonème codé selon le format ascii décrit dans
     *		http://www.icp.inpg.fr/ICP/avtts/phon.fr.html
     *	pas : le nombre de lettres à lire à partir de la lettre courante si le motif a été reconnu
     *		dans le mot de part et d'autre de la lettre en cours de traitement.
     */

    // Automate complet
    static autom = JSON.parse(`{"'":[[],{"*":[{},"#",1],"@":[{},"#",1]}],"@":[[],{"*":[{},"#",1],"@":[{},"#",1]}],"_":[[],{"*":[{},"#",1],"@":[{},"#",1]}],"a":[["u","il","in","nc_ai_fin","ai_fin","i","n","m","nm","y_except","y"],{"*":[{},"a",1],"ai_fin":[{"+":"i$"},"e_comp",2],"i":[{"+":"[iî]"},"e^_comp",2],"il":[{"+":"il($|l)"},"a",1],"in":[{"+":"i[nm]([bcçdfghjklnmpqrstvwxz]|$)"},"e~",3,"#comment# toute succession ain aim suivie d une consonne ou d une fin de mot"],"m":[{"+":"m[bp]"},"a~",2,"#comment# règle du m devant m, b, p"],"n":[{"+":"n[bcçdfgjklmpqrstvwxz]"},"a~",2],"nc_ai_fin":["regle_nc_ai_final","e^_comp",2],"nm":[{"+":"n(s?)$"},"a~",2],"u":[{"+":"u"},"o_comp",2],"y":[{"+":"y"},"e^_comp",1],"y_except":[{"+":"y","-":"(^b|cob|cip)"},"a",1,"#comment# exception : baye, cobaye"]}],"b":[["b","plomb"],{"*":[{},"b",1],"b":[{"+":"b"},"b",2],"plomb":[{"+":"(s?)$","-":"plom"},"#",1,"#comment# le b à la fin de plomb ne se prononce pas"]}],"c":[["eiy","choeur_1","choeur_2","chor","psycho","brachio","cheo","chest","chiro","chlo_chlam","chr","h","erc_orc","cisole","c_muet_fin","onc_donc","nc_muet_fin","_spect","_inct","cciey","cc","apostrophe"],{"*":[{},"k",1],"@":["","k",1],"_inct":[{"+":"t(s?)$","-":"in"},"#",1,"#comment# instinct, succinct, distinct"],"_spect":[{"+":"t(s?)$","-":"spe"},"#",1,"#comment# respect, suspect, aspect"],"apostrophe":[{"+":"('|’)"},"s",2,"#comment# apostrophe"],"brachio":[{"+":"hio","-":"bra"},"k",2,"#comment# brachiosaure, brachiocéphale"],"c_muet_fin":[{"+":"(s?)$","-":"taba|accro"},"#",1,"#comment# exceptions traitées : tabac, accroc"],"cc":[{"+":"c"},"k",2,"#comment# accorder, accompagner"],"cciey":[{"+":"c[eiyéèêëîï]"},"k",1,"#comment# accident, accepter, coccyx"],"cheo":[{"+":"héo"},"k",2,"#comment# archéo..., trachéo..."],"chest":[{"+":"hest"},"k",2,"#comment# orchestre et les mots de la même famille"],"chiro":[{"+":"hiro[p|m]"},"k",2,"#comment# chiroptère, chiromancie"],"chlo_chlam":[{"+":"hl(o|am)"},"k",2,"#comment# chlorure, chlamyde"],"choeur_1":[{"+":"hoe"},"k",2],"choeur_2":[{"+":"hœ"},"k",2],"chor":[{"+":"hor"},"k",2,"#comment# tous les choral, choriste... exceptions non traitées : chorizo, maillechort"],"chr":[{"+":"hr"},"k",2,"#comment# de chrétien à synchronisé"],"cisole":[{"+":"$","-":"^"},"s_c",1,"#comment# exemple : c est"],"eiy":[{"+":"[eiyéèêëîï]"},"s_c",1],"erc_orc":[{"+":"(s?)$","-":"[e|o]r"},"#",1,"#comment# clerc, porc,"],"h":[{"+":"h"},"s^",2],"nc_muet_fin":[{"+":"(s?)$","-":"n"},"#",1,"#comment# exceptions traitées : tous les mots terminés par *nc"],"onc_donc":[{"-":"^on|^don"},"k",1,"#comment# non exceptions traitées : onc, donc"],"psycho":[{"+":"ho","-":"psy"},"k",2,"#comment# tous les psycho quelque chose"]}],"d":[["d","aujourdhui","disole","except","dmuet","apostrophe"],{"*":[{},"d",1],"apostrophe":[{"+":"('|’)"},"d",2,"#comment# apostrophe"],"aujourdhui":[{"-":"aujour"},"d",1,"#comment# aujourd hui"],"d":[{"+":"d"},"d",2],"disole":[{"+":"$","-":"^"},"d",1,"#comment# exemple : d abord"],"dmuet":[{"+":"(s?)$"},"#",1,"#comment# un d suivi éventuellement d un s ex. : retards"],"except":[{"+":"(s?)$","-":"(aï|oue)"},"d",1,"#comment# aïd, caïd, oued"]}],"e":[["conj_v_ier","uient","ien","ien_2","een","except_en_1","except_en_2","_ent","clef","hier","adv_emment_fin","ment","imparfait","verbe_3_pluriel","au","avoir","monsieur","jeudi","jeu_","eur","eu","eu_accent_circ","in","eil","y","iy","ennemi","enn_debut_mot","dessus_dessous","et","cet","t_final","eclm_final","est_1","est_2","es_1","es_2","drz_final","n","adv_emment_a","femme","lemme","em_gene","nm","tclesmesdes","que_isole","que_gue_final","jtcnslemede","jean","ge","eoi","ex","ef","reqquechose","except_evr","2consonnes","abbaye","e_muet","e_caduc","e_deb"],{"*":[{},"q",1],"except_evr":[{"+":"vr"},"q",1,"#comment# chevrier, chevron, chevreuil..."],"2consonnes":[{"+":"[bcçdfghjklmnpqrstvwxz]{2}"},"e^_comp",1,"#comment# e suivi de 2 consonnes se prononce è"],"@":["","q_caduc",1],"_ent":["regle_mots_ent","a~",2,"#comment# quelques mots (adverbes ou noms) terminés par ent"],"abbaye":[{"+":"(s?)$","-":"abbay"},"#",1,"#comment# ben oui..."],"adv_emment_a":[{"+":"mment"},"a",1,"#comment# adverbe avec -emment => son [a]"],"adv_emment_fin":[{"+":"nt","-":"emm"},"a~",2,"#comment# adverbe avec -emment => se termine par le son [a~]"],"au":[{"+":"au"},"o_comp",3],"avoir":["regle_avoir","y",2],"cet":[{"+":"[t]$","-":"^c"},"e^_comp",1,"#comment# cet"],"clef":[{"+":"f","-":"cl"},"e_comp",2,"#comment# une clef"],"conj_v_ier":["regle_ient","#",3,"#comment# verbe du 1er groupe terminé par -ier conjugué à la 3ème pers du pluriel"],"dessus_dessous":[{"+":"ss(o?)us","-":"d"},"q",1,"#comment# dessus, dessous : e = e"],"drz_final":[{"+":"[drz](s?)$"},"e_comp",2,"#comment# e suivi d un d,r ou z en fin de mot done le son [e]"],"e_caduc":[{"+":"(s?)$","-":"[bcçdfghjklmnpqrstvwxzy]"},"q_caduc",1,"#comment# un e suivi éventuellement d un s et précédé d une consonne ex. : correctes"],"e_deb":[{"-":"^"},"q",1,"#comment# par défaut, un e en début de mot se prononce [q]"],"e_muet":[{"+":"(s?)$","-":"[aeiouéèêà]"},"#",1,"#comment# un e suivi éventuellement d un s et précédé d une voyelle ou d un g ex. : pie, geai"],"eclm_final":[{"+":"[clm](s?)$"},"e^_comp",1,"#comment# donne le son [e^] et le l ou le c se prononcent (ex. : miel, sec)"],"een":[{"+":"n(s?)$","-":"é"},"e~",2,"#comment# les mots qui se terminent par -éen"],"ef":[{"+":"[bf](s?)$"},"e^",1,"#comment# e suivi d un f ou d un b en fin de mot se prononce è"],"eil":[{"+":"il"},"e^_comp",1],"em_gene":[{"+":"m[bcçdfghjklmnpqrstvwxz]"},"a~",2,"#comment# em cas général => son [a~]"],"enn_debut_mot":[{"+":"nn","-":"^"},"a~",2,"#comment# enn en début de mot se prononce en"],"ennemi":[{"+":"nnemi","-":"^"},"e^_comp",1,"#comment# ennemi est l exception ou enn en début de mot se prononce èn (cf. enn_debut_mot)"],"eoi":[{"+":"oi"},"#",1,"#comment# un e suivi de oi ; ex. : asseoir"],"es_1":[{"+":"s$","-":"^"},"e^_comp",2],"es_2":[{"+":"s$","-":"@"},"e^_comp",2],"est_1":[{"+":"st$","-":"^"},"e^_comp",3],"est_2":[{"+":"st$","-":"@"},"e^_comp",3],"et":[{"+":"t$","-":"^"},"e_comp",2],"eu":[{"+":"u"},"x",2],"eu_accent_circ":[{"+":"û"},"x^",2],"eur":[{"+":"ur"},"x",2],"ex":[{"+":"x"},"e^",1,"#comment# e suivi d un x se prononce è"],"except_en_1":[{"+":"n(s?)$","-":"exam|mino|édu"},"e~",2,"#comment# exceptions des mots où le en final se prononce [e~] (héritage latin)"],"except_en_2":[{"+":"n(s?)$","-":"[ao]ï"},"e~",2,"#comment# païen, hawaïen, tolstoïen"],"femme":[{"+":"mm","-":"f"},"a",1,"#comment# femme et ses dérivés => son [a]"],"ge":[{"+":"[aouàäôâ]","-":"g"},"#",1,"#comment# un e précédé d un g et suivi d une voyelle ex. : cageot"],"hier":["regle_er","e^_comp",1,"#comment# encore des exceptions avec les mots terminés par er prononcés R"],"ien":[{"+":"n([bcçdfghjklpqrstvwxz]|$)","-":"[bcdlmrstvh]i"},"e~",2,"#comment# certains mots avec ien => son [e~]"],"ien_2":[{"+":"n([bcçdfghjklpqrstvwxz]|$)","-":"ï"},"e~",2,"#comment# certains mots avec ien => son [e~]"],"imparfait":[{"+":"nt$","-":"ai"},"verb_3p",3,"#comment# imparfait à la 3ème personne du pluriel"],"in":[{"+":"i[nm]([bcçdfghjklnmpqrstvwxz]|$)"},"e~",3,"#comment# toute succession ein eim suivie d une consonne ou d une fin de mot"],"iy":[{"+":"[iy]"},"e^_comp",2],"jean":[{"+":"an","-":"j"},"#",1,"#comment# jean"],"jeu_":[{"+":"u","-":"j"},"x",2,"#comment# tous les jeu* sauf jeudi"],"jeudi":[{"+":"udi","-":"j"},"x^",2,"#comment# jeudi"],"jtcnslemede":[{"+":"$","-":"^[jtcnslmd]"},"q",1,"#comment# je, te, me, le, se, de, ne"],"lemme":[{"+":"mm","-":"l"},"e^_comp",1,"#comment# lemme et ses dérivés => son [e^]"],"ment":["regle_ment","a~",2,"#comment# on considère que les mots terminés par -ment se prononcent [a~] sauf s il s agit d un verbe"],"monsieur":[{"+":"ur","-":"si"},"x^",2],"n":[{"+":"n[bcçdfghjklmpqrstvwxz]"},"a~",2],"nm":[{"+":"[nm]$"},"a~",2],"que_gue_final":[{"+":"(s?)$","-":"[gq]u"},"q_caduc",1,"#comment# que ou gue final"],"que_isole":[{"+":"$","-":"^qu"},"q",1,"#comment# que isolé"],"reqquechose":[{"+":"[bcçdfghjklmnpqrstvwxz](h|l|r)","-":"r"},"q",1,"#comment# re-quelque chose : le e se prononce e"],"t_final":[{"+":"[t]$"},"e^_comp",2,"#comment# donne le son [e^] et le t ne se prononce pas"],"tclesmesdes":[{"+":"s$","-":"^[tcslmd]"},"e_comp",2,"#comment# mes, tes, ces, ses, les"],"uient":[{"+":"nt$","-":"ui"},"#",3,"#comment# enfuient, appuient, fuient, ennuient, essuient"],"verbe_3_pluriel":[{"+":"nt$"},"q_caduc",1,"#comment# normalement, pratiquement tout le temps verbe à la 3eme personne du pluriel"],"y":[{"+":"y[aeiouéèêààäôâ]"},"e^_comp",1]}],"f":[["f","oeufs"],{"*":[{},"f",1],"f":[{"+":"f"},"f",2],"oeufs":[{"+":"s","-":"(oeu|œu)"},"#",1,"#comment# oeufs et boeufs"]}],"g":[["g","ao","eiy","aiguille","u_consonne","u","n","vingt","g_muet_oin","g_muet_our","g_muet_an","g_muet_fin"],{"*":[{},"g",1],"aiguille":[{"+":"u","-":"ai"},"g",1,"#comment# encore une exception : aiguille et ses dérivés"],"ao":[{"+":"a|o"},"g",1],"eiy":[{"+":"[eéèêëïiy]"},"z^_g",1,"#comment# un g suivi de e,i,y se prononce [z^]"],"g":[{"+":"g"},"g",2],"g_muet_an":[{"+":"(s?)$","-":"(s|^ét|^r)an"},"#",1,"#comment# sang, rang, étang"],"g_muet_fin":[{"-":"lon|haren"},"#",1,"#comment# pour traiter les exceptions : long, hareng"],"g_muet_oin":[{"-":"oi(n?)"},"#",1,"#comment# un g précédé de oin ou de oi ne se prononce pas ; ex. : poing, doigt"],"g_muet_our":[{"-":"ou(r)"},"#",1,"#comment# un g précédé de our ou de ou ne se prononce pas ; ex. : bourg"],"n":[{"+":"n"},"n~",2],"u":[{"+":"u"},"g_u",2],"u_consonne":[{"+":"u[bcçdfghjklmnpqrstvwxz]"},"g",1,"#comment# gu suivi d une consonne se prononce [g][y]"],"vingt":[{"+":"t","-":"vin"},"#",1,"#comment# vingt"]}],"h":[["h1","h2","h3","h4","h5","h6","h7","h8"],{"*":[{},"#",1],"h1":[{"-":"^","+":"ô"},"#_h_muet",1],"h2":[{"-":"^","+":"y"},"#_h_muet",1],"h3":[{"-":"^","+":"a(rm|b|ll)"},"#_h_muet",1],"h4":[{"-":"^","+":"e([bclprx]|ur)"},"#_h_muet",1],"h5":[{"-":"^","+":"é([bcdfgjkmnpqstvwxz]|li|ra|ré|rit)"},"#_h_muet",1],"h6":[{"-":"^","+":"i([bv][^o]|st)"},"#_h_muet",1],"h7":[{"-":"^","+":"o(m[imo]|nne|no|r[^ds]|s[pt])"},"#_h_muet",1],"h8":[{"-":"^","+":"u(î|i[ls]|ma[in|ni|no]|mb|mec|meu|mér|mi|mor)"},"#_h_muet",1]}],"i":[["ing","n","m","nm","prec_2cons","lldeb","vill","mill","tranquille","ill","@ill","@il","ll","ui","ient_1","ient_2","ie"],{"*":[{},"i",1],"@il":[{"+":"l(s?)$","-":"[aeou]"},"j",2,"#comment# par défaut précédé d une voyelle et suivi de l donne le son [j]"],"@ill":[{"+":"ll","-":"[aeo]"},"j",3,"#comment# par défaut précédé d une voyelle et suivi de ll donne le son [j]"],"ie":[{"+":"e(s)?$"},"i",1,"#comment# mots terminés par -ie(s|nt)"],"ient_1":["regle_ient","i",1,"#comment# règle spécifique pour différencier les verbes du premier groupe 3ème pers pluriel"],"ient_2":[{"+":"ent(s)?$"},"j",1,"#comment# si la règle précédente ne fonctionne pas"],"ill":[{"+":"ll","-":"[bcçdfghjklmnpqrstvwxz](u?)"},"i",1,"#comment# précédé éventuellement d un u et d une consonne, donne le son [i]"],"ing":[{"+":"ng$","-":"[bcçdfghjklmnpqrstvwxz]"},"i",1],"ll":[{"+":"ll"},"j",3,"#comment# par défaut avec ll donne le son [j]"],"lldeb":[{"+":"ll","-":"^"},"i",1],"m":[{"+":"m[bcçdfghjklnpqrstvwxz]"},"e~",2],"mill":[{"+":"ll","-":"m"},"i",1],"n":[{"+":"n[bcçdfghjklmpqrstvwxz]"},"e~",2],"nm":[{"+":"[n|m]$"},"e~",2],"prec_2cons":[{"-":"[ptkcbdgfv][lr]"},"i",1,"#comment# précédé de 2 consonnes (en position 3), doit apparaître comme [ij]"],"tranquille":[{"+":"ll","-":"tranqu"},"i",1],"ui":[{"+":"ent","-":"u"},"i",1,"#comment# essuient, appuient"],"vill":[{"+":"ll","-":"v"},"i",1]}],"j":[[],{"*":[{},"z^",1]}],"k":[[],{"*":[{},"k",1]}],"l":[["vill","mill","tranquille","illdeb","ill","eil","ll","excep_il","apostrophe","lisole"],{"*":[{},"l",1],"apostrophe":[{"+":"('|’)"},"l",2,"#comment# apostrophe"],"eil":[{"-":"e(u?)i"},"j",1,"#comment# les mots terminés en eil ou ueil => son [j]"],"excep_il":[{"+":"(s?)$","-":"fusi|outi|genti"},"#",1,"#comment# les exceptions trouvées ou le l à la fin ne se prononce pas : fusil, gentil, outil"],"ill":[{"+":"l","-":".i"},"j",2,"#comment# par défaut, ill donne le son [j]"],"illdeb":[{"+":"l","-":"^i"},"l",2,"#comment# ill en début de mot = son [l] ; exemple : illustration"],"lisole":[{"+":"$","-":"^"},"l",1,"#comment# exemple : l animal"],"ll":[{"+":"l"},"l",2,"#comment# à défaut de l application d une autre règle, ll donne le son [l]"],"mill":[{"+":"l","-":"^mi"},"l",2,"#comment# mille, million, etc. => son [l]"],"tranquille":[{"+":"l","-":"tranqui"},"l",2,"#comment# tranquille => son [l]"],"vill":[{"+":"l","-":"^vi"},"l",2,"#comment# ville, village etc. => son [l]"]}],"m":[["m","damn","tomn","misole","apostrophe"],{"*":[{},"m",1],"apostrophe":[{"+":"('|’)"},"m",2],"damn":[{"+":"n","-":"da"},"#",1,"#comment# regle spécifique pour damné et ses dérivés"],"m":[{"+":"m"},"m",2],"misole":[{"+":"$","-":"^"},"m",1,"#comment# exemple : m a"],"tomn":[{"+":"n","-":"to"},"#",1,"#comment# regle spécifique pour automne et ses dérivés"]}],"n":[["ing","n","ment","urent","irent","erent","ent","nisole","apostrophe"],{"*":[{},"n",1],"apostrophe":[{"+":"('|’)"},"n",2],"ent":[{"+":"t$","-":"e"},"verb_3p",2],"erent":[{"+":"t$","-":"ère"},"verb_3p",2,"#comment# verbes avec terminaisons en -èrent"],"ing":[{"+":"g$","-":"i"},"g~",2],"irent":[{"+":"t$","-":"ire"},"verb_3p",2,"#comment# verbes avec terminaisons en -irent"],"ment":["regle_verbe_mer","verb_3p",2,"#comment# on considère que les verbent terminés par -ment se prononcent [#]"],"n":[{"+":"n"},"n",2],"nisole":[{"+":"$","-":"^"},"n",1,"#comment# exemple : n a"],"urent":[{"+":"t$","-":"ure"},"verb_3p",2,"#comment# verbes avec terminaisons en -urent"]}],"o":[["in","oignon","i","tomn","monsieur","n","m","nm","y1","y2","u","o","oe_0","oe_1","oe_2","oe_3","voeux","oeufs","noeud","oeu_defaut","oe_defaut"],{"*":[{},"o",1],"i":[{"+":"(i|î)"},"wa",2],"in":[{"+":"i[nm]([bcçdfghjklnmpqrstvwxz]|$)"},"w",1],"m":[{"+":"m[bcçdfgjklpqrstvwxz]"},"o~",2,"#comment# toute consonne sauf le m"],"monsieur":[{"+":"nsieur","-":"m"},"q",2],"n":[{"+":"n[bcçdfgjklmpqrstvwxz]"},"o~",2],"nm":[{"+":"[nm]$"},"o~",2],"noeud":[{"+":"eud"},"x^",3,"#comment# noeud"],"o":[{"+":"o"},"o",2,"#comment# exemple : zoo"],"oe_0":[{"+":"ê"},"wa",2],"oe_1":[{"+":"e","-":"c"},"o",1,"#comment# exemple : coefficient"],"oe_2":[{"+":"e","-":"m"},"wa",2,"#comment# exemple : moelle"],"oe_3":[{"+":"e","-":"f"},"e",2,"#comment# exemple : foetus"],"oe_defaut":[{"+":"e"},"x",2,"#comment# exemple : oeil"],"oeu_defaut":[{"+":"eu"},"x",3,"#comment# exemple : oeuf"],"oeufs":[{"+":"eufs"},"x^",3,"#comment# traite oeufs et boeufs"],"oignon":[{"+":"ignon","-":"^"},"o",2],"tomn":[{"+":"mn","-":"t"},"o",1,"#comment# regle spécifique pour automne et ses dérivés"],"u":[{"+":"[uwûù]"},"u",2,"#comment# son [u] : clou, clown"],"voeux":[{"+":"eux"},"x^",3,"#comment# voeux"],"y1":[{"+":"y$"},"wa",2],"y2":[{"+":"y"},"wa",1]}],"p":[["h","oup","drap","trop","sculpt","sirop","sgalop","rps","amp","compt","bapti","sept","p"],{"*":[{},"p",1],"amp":[{"+":"$","-":"c(h?)am"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : camp, champ"],"bapti":[{"+":"ti","-":"ba"},"#",1,"#comment# les exceptions avec un p muet : les mots en *bapti*"],"compt":[{"+":"t","-":"com"},"#",1,"#comment# les exceptions avec un p muet : les mots en *compt*"],"drap":[{"+":"$","-":"dra"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : drap"],"h":[{"+":"h"},"f_ph",2],"oup":[{"+":"$","-":"[cl]ou"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : loup, coup"],"p":[{"+":"p"},"p",2],"rps":[{"+":"s$","-":"[rm]"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : corps, camp"],"sculpt":[{"+":"t","-":"scul"},"#",1,"#comment# les exceptions avec un p muet : sculpter et les mots de la même famille"],"sept":[{"+":"t(s?)$","-":"^se"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : sept"],"sgalop":[{"+":"$","-":"[gs]alo"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : galop"],"sirop":[{"+":"$","-":"siro"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : sirop"],"trop":[{"+":"$","-":"tro"},"#",1,"#comment# les exceptions avec un p muet en fin de mot : trop"]}],"q":[["qu","qu_apos","k"],{"*":[{},"k",1],"k":[{"+":"u"},"k_qu",2],"qu_apos":[{"+":"u['|’]"},"k_qu",3],"qu":[{"+":"u[bcçdfgjklmnpqrstvwxz]"},"k",1]}],"r":[["monsieur","messieurs","gars","r"],{"*":[{},"r",1],"gars":[{"+":"s","-":"ga"},"#",2,"#comment# gars"],"messieurs":[{"-":"messieu"},"#",1],"monsieur":[{"-":"monsieu"},"#",1],"r":[{"+":"r"},"r",2]}],"s":[["sch","h","s_final","parasit","para","mars","s","z","sisole","smuet","apostrophe"],{"*":[{},"s",1],"@":[{},"#",1],"apostrophe":[{"+":"('|’)"},"s",2,"#comment# apostrophe"],"h":[{"+":"h"},"s^",2],"mars":[{"+":"$","-":"mar"},"s",1,"#comment# mars"],"para":[{"-":"para"},"s",1,"#comment# para quelque chose (parasol, parasismique, ...)"],"parasit":[{"+":"it","-":"para"},"z_s",1,"#comment# parasit*"],"s":[{"+":"s"},"s",2,"#comment# un s suivi d un autre s se prononce [s]"],"s_final":["regle_s_final","s",1,"#comment# quelques mots terminés par -us, -is, -os, -as"],"sch":[{"+":"ch"},"s^",3,"#comment# schlem"],"sisole":[{"+":"$","-":"^"},"s",1,"#comment# exemple : s approche"],"smuet":[{"+":"$","-":"(e?)"},"#",1,"#comment# un s en fin de mot éventuellement précédé d un e ex. : correctes"],"z":[{"+":"[aeiyouéèàüûùëöêîô]","-":"[aeiyouéèàüûùëöêîô]"},"z_s",1,"#comment# un s entre 2 voyelles se prononce [z]"]}],"t":[["t","tisole","except_tien","_tien","cratie","vingt","tion","ourt","_inct","_spect","_ct","_est","t_final","tmuet","apostrophe"],{"*":[{},"t",1],"@":[{},"#",1],"_ct":[{"+":"(s?)$","-":"c"},"t",1,"#comment# tous les autres mots terminés par -ct"],"_est":[{"+":"(s?)$","-":"es"},"t",1,"#comment# test, ouest, brest, west, zest, lest"],"_inct":[{"+":"(s?)$","-":"inc"},"#",1,"#comment# instinct, succinct, distinct"],"_spect":[{"+":"(s?)$","-":"spec"},"#",1,"#comment# respect, suspect, aspect"],"_tien":[{"+":"ien"},"s_t",1],"apostrophe":[{"+":"('|’)"},"t",2,"#comment# apostrophe"],"cratie":[{"+":"ie","-":"cra"},"s_t",1],"except_tien":["regle_tien","t",1,"#comment# quelques mots où tien se prononce [t]"],"ourt":[{"+":"$","-":"(a|h|g)our"},"t",1,"#comment# exemple : yaourt, yoghourt, yogourt"],"t":[{"+":"t"},"t",2],"t_final":["regle_t_final","t",1,"#comment# quelques mots où le t final se prononce"],"tion":[{"+":"ion"},"s_t",1],"tisole":[{"+":"$","-":"^"},"t",1,"#comment# exemple : demande-t-il"],"tmuet":[{"+":"(s?)$"},"#",1,"#comment# un t suivi éventuellement d un s ex. : marrants"],"vingt":[{"+":"$","-":"ving"},"t",1,"#comment# vingt mais pas vingts"]}],"u":[["um","n","nm","ueil"],{"*":[{},"y",1],"n":[{"+":"n[bcçdfghjklmpqrstvwxz]"},"x~",2],"nm":[{"+":"[nm]$"},"x~",2],"ueil":[{"+":"eil"},"x",2,"#comment# mots terminés en ueil => son [x^]"],"um":[{"+":"m$","-":"[^aefo]"},"o",1]}],"v":[[],{"*":[{},"v",1]}],"w":[["wurt","wisig","wag","wa","wi"],{"*":[{},"w",1],"wa":[{"+":"a"},"wa",2,"#comment# watt, wapiti, etc."],"wag":[{"+":"ag"},"v",1,"#comment# wagons et wagnérien"],"wi":[{"+":"i"},"u",1,"#comment# kiwi"],"wisig":[{"+":"isig"},"v",1,"#comment# wisigoth"],"wurt":[{"+":"urt"},"v",1,"#comment# saucisse"]}],"x":[["six_dix","gz_1","gz_2","gz_3","gz_4","gz_5","_aeox","fix","_ix"],{"*":[{},"ks",1],"@":[{},"#",1],"_aeox":[{"-":"[aeo]"},"ks",1],"_ix":[{"-":"(remi|obéli|astéri|héli|phéni|féli)"},"ks",1],"fix":[{"-":"fi"},"ks",1],"gz_1":[{"+":"[aeiouéèàüëöêîôûù]","-":"^"},"gz",1,"#comment# mots qui commencent par un x suivi d une voyelle"],"gz_2":[{"+":"[aeiouéèàüëöêîôûù]","-":"^(h?)e"},"gz",1,"#comment# mots qui commencent par un ex ou hex suivi d une voyelle"],"gz_3":[{"+":"[aeiouéèàüëöêîôûù]","-":"^coe"},"gz",1,"#comment# mots qui commencent par un coex suivi d une voyelle"],"gz_4":[{"+":"[aeiouéèàüëöêîôûù]","-":"^ine"},"gz",1,"#comment# mots qui commencent par un inex suivi d une voyelle"],"gz_5":[{"+":"[aeiouéèàüëöêîôûù]","-":"^(p?)rée"},"gz",1,"#comment# mots qui commencent par un réex ou préex suivi d une voyelle"],"six_dix":[{"-":"(s|d)i"},"s_x",1]}],"y":[["m","n","nm","abbaye","y_voyelle"],{"*":[{},"i",1],"abbaye":[{"+":"e","-":"abba"},"i",1,"#comment# abbaye... bien irrégulier"],"m":[{"+":"m[mpb]"},"e~",2],"n":[{"+":"n[bcçdfghjklmpqrstvwxz]"},"e~",2],"nm":[{"+":"[n|m]$"},"e~",2],"y_voyelle":[{"+":"[aeiouéèàüëöêîôûù]"},"j",1,"#comment# y suivi d une voyelle donne [j]"]}],"z":[["raz_riz"],{"*":[{},"z",1],"@":[{},"z",1],"raz_riz":[{"+":"$","-":"^r[ai]"},"#",1,"#comment# raz et riz : z = #"]}],"à":[[],{"*":[{},"a",1]}],"â":[[],{"*":[{},"a",1]}],"ç":[[],{"*":[{},"s",1]}],"è":[[],{"*":[{},"e^",1]}],"é":[[],{"*":[{},"e",1]}],"ê":[[],{"*":[{},"e^",1]}],"ë":[[],{"*":[{},"e^",1]}],"î":[[],{"*":[{},"i",1]}],"ï":[["thai","aie"],{"*":[{},"i",1],"aie":[{"+":"e","-":"[ao]"},"j",1,"#comment# païen et autres"],"thai":[{"-":"t(h?)a"},"j",1,"#comment# taï, thaï et dérivés"]}],"ô":[[],{"*":[{},"o",1]}],"ö":[[],{"*":[{},"o",1]}],"ù":[[],{"*":[{},"y",1]}],"û":[[],{"*":[{},"y",1]}],"œ":[["voeux","oeufs","noeud"],{"*":[{"+":"u"},"x^",2],"noeud":[{"+":"ud"},"x^",2,"#comment# noeud"],"oeufs":[{"+":"ufs"},"x^",2,"#comment# traite oeufs et boeufs"],"voeux":[{"+":"ux"},"x^",2,"#comment# voeux"]}]}`);

    // Ensemble de verbes qui se terminent par -ier // attention : pas d'accents !!
    static verbes_ier = ["affilier", "allier", "allier", "amnistier", "amplifier", "anesthesier", "apparier", "approprier", "apprecier", "asphyxier", "associer", "atrophier", "authentifier", "autographier", "autopsier", "balbutier", "bonifier", "beatifier", "beneficier", "betifier", "calligraphier", "calomnier", "carier", "cartographier", "certifier", "charrier", "chier", "choregraphier", "chosifier", "chatier", "clarifier", "classifier", "cocufier", "codifier", "colorier", "communier", "conchier", "concilier", "confier", "congedier", "contrarier", "copier", "crier", "crucifier", "dactylographier", "differencier", "disgracier", "disqualifier", "dissocier", "distancier", "diversifier", "domicilier", "decrier", "dedier", "defier", "deifier", "delier", "demarier", "demultiplier", "demystifier", "denazifier", "denier", "deplier", "deprecier", "dequalifier", "devier", "envier", "estropier", "excommunier", "exemplifier", "exfolier", "expatrier", "expier", "exproprier", "expedier", "extasier", "falsifier", "fier", "fluidifier", "fortifier", "frigorifier", "fructifier", "gazeifier", "glorifier", "gracier", "gratifier", "horrifier", "humidifier", "humilier", "identifier", "incendier", "ingenier", "initier", "injurier", "intensifier", "inventorier", "irradier", "justifier", "licencier", "lier", "liquefier", "lubrifier", "magnifier", "maleficier", "manier", "marier", "mendier", "modifier", "momifier", "mortifier", "multiplier", "mystifier", "mythifier", "mefier", "nier", "notifier", "negocier", "obvier", "officier", "opacifier", "orthographier", "oublier", "pacifier", "palinodier", "pallier", "parier", "parodier", "personnifier", "photocopier", "photographier", "plagier", "planifier", "plastifier", "plier", "polycopier", "pontifier", "prier", "privilegier", "psalmodier", "publier", "purifier", "putrefier", "pepier", "petrifier", "qualifier", "quantifier", "radier", "radiographier", "rallier", "ramifier", "rapatrier", "rarefier", "rassasier", "ratifier", "razzier", "recopier", "rectifier", "relier", "remanier", "remarier", "remercier", "remedier", "renier", "renegocier", "replier", "republier", "requalifier", "revivifier", "reverifier", "rigidifier", "reconcilier", "recrier", "reexpedier", "refugier", "repertorier", "repudier", "resilier", "reunifier", "reedifier", "reetudier", "sacrifier", "salarier", "sanctifier", "scier", "signifier", "simplifier", "skier", "solidifier", "soucier", "spolier", "specifier", "statufier", "strier", "stupefier", "supplicier", "supplier", "serier", "terrifier", "tonifier", "trier", "tumefier", "typographier", "telegraphier", "unifier", "varier", "versifier", "vicier", "vitrifier", "vivifier", "verifier", "echographier", "ecrier", "edifier", "electrifier", "emulsifier", "epier", "etudier"];

    //Ensemble de mots qui se terminent par -ent
    static mots_ent = ["absent", "abstinent", "accent", "accident", "adhérent", "adjacent", "adolescent", "afférent", "agent", "ambivalent", "antécédent", "apparent", "arborescent", "ardent", "ardent", "argent", "arpent", "astringent", "auvent", "avent", "cent", "chiendent", "client", "coefficient", "cohérent", "dent", "différent", "diligent", "dissident", "divergent", "dolent", "décadent", "décent", "déficient", "déférent", "déliquescent", "détergent", "excipient", "fervent", "flatulent", "fluorescent", "fréquent", "féculent", "gent", "gradient", "grandiloquent", "immanent", "imminent", "impatient", "impertinent", "impotent", "imprudent", "impudent", "impénitent", "incandescent", "incident", "incohérent", "incompétent", "inconscient", "inconséquent", "incontinent", "inconvénient", "indifférent", "indigent", "indolent", "indulgent", "indécent", "ingrédient", "inhérent", "inintelligent", "innocent", "insolent", "intelligent", "interférent", "intermittent", "iridescent", "lactescent", "latent", "lent", "luminescent", "malcontent", "mécontent", "occident", "omnipotent", "omniprésent", "omniscient", "onguent", "opalescent", "opulent", "orient", "paravent", "parent", "patent", "patient", "permanent", "pertinent", "phosphorescent", "polyvalent", "pourcent", "proéminent", "prudent", "précédent", "présent", "prévalent", "pschent", "purulent", "putrescent", "pénitent", "quotient", "relent", "récent", "récipient", "récurrent", "référent", "régent", "rémanent", "réticent", "sanguinolent", "sergent", "serpent", "somnolent", "souvent", "spumescent", "strident", "subconscient", "subséquent", "succulent", "tangent", "torrent", "transparent", "trident", "truculent", "tumescent", "turbulent", "turgescent", "urgent", "vent", "ventripotent", "violent", "virulent", "effervescent", "efficient", "effluent", "engoulevent", "entregent", "escient", "event", "excédent", "expédient", "éloquent", "éminent", "émollient", "évanescent", "évent"];
    static verbes_enter = ["absenter", "accidenter", "agrémenter", "alimenter", "apparenter", "cimenter", "contenter", "complimenter", "bonimenter", "documenter", "patienter", "parlementer", "ornementer", "supplémenter", "argenter", "éventer", "supplémenter", "tourmenter", "violenter", "arpenter", "serpenter", "coefficienter", "argumenter", "présenter"];

    // Ensemble de verbes qui se terminent par -mer
    static verbes_mer = ["abimer", "acclamer", "accoutumer", "affamer", "affirmer", "aimer", "alarmer", "allumer", "amalgamer", "animer", "armer", "arrimer", "assommer", "assumer", "blasphemer", "blamer", "bramer", "brimer", "calmer", "camer", "carmer", "charmer", "chloroformer", "chomer", "clamer", "comprimer", "confirmer", "conformer", "consommer", "consumer", "costumer", "cramer", "cremer", "damer", "diffamer", "diplomer", "decimer", "declamer", "decomprimer", "deformer", "degommer", "denommer", "deplumer", "deprimer", "deprogrammer", "desaccoutumer", "desarmer", "desinformer", "embaumer", "embrumer", "empaumer", "enfermer", "enflammer", "enfumer", "enrhumer", "entamer", "enthousiasmer", "entraimer", "envenimer", "escrimer", "estimer", "exclamer", "exhumer", "exprimer", "fantasmer", "fermer", "filmer", "flemmer", "former", "frimer", "fumer", "gendarmer", "germer", "gommer", "grammer", "grimer", "groumer", "humer", "imprimer", "infirmer", "informer", "inhumer", "intimer", "lamer", "limer", "legitimer", "mimer", "mesestimer", "nommer", "opprimer", "palmer", "parfumer", "parsemer", "paumer", "plumer", "pommer", "primer", "proclamer", "programmer", "preformer", "prenommer", "presumer", "pamer", "perimer", "rallumer", "ramer", "ranimer", "refermer", "reformer", "refumer", "remplumer", "renfermer", "renommer", "rentamer", "reprogrammer", "ressemer", "retransformer", "rimer", "rythmer", "reaccoutumer", "reaffirmer", "reanimer", "rearmer", "reassumer", "reclamer", "reformer", "reimprimer", "reprimer", "resumer", "retamer", "semer", "slalomer", "sommer", "sublimer", "supprimer", "surestimer", "surnommer", "tramer", "transformer", "trimer", "zoomer", "ecremer", "ecumer", "elimer"];

    // il faut savoir si le mot figure dans la liste des exceptions
    static exceptions_final_er = ["amer", "cher", "hier", "mer", "coroner", "charter", "cracker", "hiver", "chester", "doppler", "cascher", "bulldozer", "cancer", "carter", "geyser", "cocker", "pullover", "alter", "aster", "fer", "ver", "diver", "perver", "enfer", "traver", "univer", "cuiller", "container", "cutter", "révolver", "super", "master", "enver"];

    static possibles_nc_ai_final = ["balai", "brai", "chai", "déblai", "délai", "essai", "frai", "geai", "lai", "mai", "minerai", "papegai", "quai", "rai", "remblai"];

    static possibles_avoir = ["eu", "eue", "eues", "eus", "eut", "eûmes", "eûtes", "eurent", "eusse", "eusses", "eût", "eussions", "eussiez", "eussent"];

    static mots_s_final = ["abribus", "airbus", "autobus", "bibliobus", "bus", "nimbus", "gibus", "microbus", "minibus", "mortibus", "omnibus", "oribus", "pédibus", "quibus", "rasibus", "rébus", "syllabus", "trolleybus", "virus", "antivirus", "anus", "asparagus", "médius", "autofocus", "focus", "benedictus", "bonus", "campus", "cirrus", "citrus", "collapsus", "consensus", "corpus", "crochus", "crocus", "crésus", "cubitus", "humérus", "diplodocus", "eucalyptus", "erectus", "hypothalamus", "mordicus", "mucus", "stratus", "nimbostratus", "nodus", "modus", "opus", "ours", "papyrus", "plexus", "plus", "processus", "prospectus", "lapsus", "prunus", "quitus", "rétrovirus", "sanctus", "sinus", "solidus", "liquidus", "stimulus", "stradivarius", "terminus", "tonus", "tumulus", "utérus", "versus", "détritus", "ratus", "couscous", "burnous", "tous", "anis", "bis", "anubis", "albatros", "albinos", "calvados", "craignos", "mérinos", "rhinocéros", "tranquillos", "tétanos", "os", "alias", "atlas", "hélas", "madras", "sensas", "tapas", "trias", "vasistas", "hypocras", "gambas", "as", "biceps", "quadriceps", "chips", "relaps", "forceps", "schnaps", "laps", "oups", "triceps", "princeps", "tricératops"];

    static mots_t_final = ["accessit", "cet", "but", "diktat", "kumquat", "prurit", "affidavit", "dot", "rut", "audit", "exeat", "magnificat", "satisfecit", "azimut", "exit", "mat", "scorbut", "brut", "fiat", "mazout", "sinciput", "cajeput", "granit", "net", "internet", "transat", "sept", "chut", "huit", "obit", "transit", "coït", "incipit", "occiput", "ut", "comput", "introït", "pat", "zut", "déficit", "inuit", "prétérit", "gadget", "kilt", "kit", "scout", "fret"];

    static exceptions_final_tien = ["chrétien", "entretien", "kantien", "proustien", "soutien"];

    static exceptions_er_final = ["amer", "cher", "hier", "mer", "coroner", "charter", "cracker", "hiver", "chester", "doppler", "cascher", "bulldozer", "cancer", "carter", "geyser", "cocker", "pullover", "alter", "aster", "fer", "ver", "diver", "perver", "enfer", "traver", "univer", "cuiller", "container", "cutter", "révolver", "super", "master", "enver"];

    static exceptions_en_final = ["abdomen", "dolmen", "gentlemen", "golden", "pollen", "spécimen", "zen"];

    static determinant = ["mon", "ton", "son", "notre", "votre", "leur", "ma", "ta", "sa", "mes", "tes",
        "ses", "nos", "vos", "leurs", "un", "une", "le", "la", "l'", "des", "les", "ce",
        "cette", "cet", "ces", "du"];
    static pronom = ["je", "j'", "j'", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
        "y", "s'y", "me", "te", "se"];

    static homographesNonHomophones = {
        couvent:
            [{ precedent: LireCouleur.pronom, codage: [{ "phoneme": "k", "lettres": "c" }, { "phoneme": "u", "lettres": "ou" }, { "phoneme": "v", "lettres": "v" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] },
            { precedent: LireCouleur.determinant, codage: [{ "phoneme": "k", "lettres": "c" }, { "phoneme": "u", "lettres": "ou" }, { "phoneme": "v", "lettres": "v" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] }],
        portions:
            [{ precedent: LireCouleur.pronom, codage: [{ "phoneme": "p", "lettres": "p" }, { "phoneme": "o", "lettres": "o" }, { "phoneme": "r", "lettres": "r" }, { "phoneme": "t", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] },
            { precedent: LireCouleur.determinant, codage: [{ "phoneme": "p", "lettres": "p" }, { "phoneme": "o", "lettres": "o" }, { "phoneme": "r", "lettres": "r" }, { "phoneme": "s_t", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] }],
        vis:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "v", "lettres": "v" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "s", "lettres": "s" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "v", "lettres": "v" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "#", "lettres": "s" }] }],
        fier:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "f", "lettres": "f" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "e^_comp", "lettres": "e" }, { "phoneme": "r", "lettres": "r" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "f", "lettres": "f" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "e_comp", "lettres": "er" }] }],
        éditions:
            [{ precedent: LireCouleur.pronom, codage: [{ "phoneme": "e", "lettres": "é" }, { "phoneme": "d", "lettres": "d" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "s_t", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] },
            { precedent: LireCouleur.determinant, codage: [{ "phoneme": "e", "lettres": "é" }, { "phoneme": "d", "lettres": "d" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "s", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] }],
        violent:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "v", "lettres": "v" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "o", "lettres": "o" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "v", "lettres": "v" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "o", "lettres": "o" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] }],
        négligent:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "n", "lettres": "n" }, { "phoneme": "e", "lettres": "é" }, { "phoneme": "g", "lettres": "g" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "z^_g", "lettres": "g" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "n", "lettres": "n" }, { "phoneme": "e", "lettres": "é" }, { "phoneme": "g", "lettres": "g" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "z^_g", "lettres": "g" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] }],
        résident:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "r", "lettres": "r" }, { "phoneme": "e", "lettres": "é" }, { "phoneme": "z_s", "lettres": "s" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "d", "lettres": "d" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "r", "lettres": "r" }, { "phoneme": "e", "lettres": "é" }, { "phoneme": "z_s", "lettres": "s" }, { "phoneme": "i", "lettres": "i" }, { "phoneme": "d", "lettres": "d" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] }],
        excellent:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "e^", "lettres": "e" }, { "phoneme": "ks", "lettres": "x" }, { "phoneme": "s_c", "lettres": "c" }, { "phoneme": "e^_comp", "lettres": "e" }, { "phoneme": "l", "lettres": "ll" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "e^", "lettres": "e" }, { "phoneme": "ks", "lettres": "x" }, { "phoneme": "s_c", "lettres": "c" }, { "phoneme": "e^_comp", "lettres": "e" }, { "phoneme": "l", "lettres": "ll" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] }],
        affluent:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "a", "lettres": "a" }, { "phoneme": "f", "lettres": "ff" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "y", "lettres": "u" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "a", "lettres": "a" }, { "phoneme": "f", "lettres": "ff" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "y", "lettres": "u" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] }],
        content:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "k", "lettres": "c" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "t", "lettres": "t" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "k", "lettres": "c" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "t", "lettres": "t" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] }],
        parent:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "p", "lettres": "p" }, { "phoneme": "a", "lettres": "a" }, { "phoneme": "r", "lettres": "r" }, { "phoneme": "a~", "lettres": "en" }, { "phoneme": "#", "lettres": "t" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "p", "lettres": "p" }, { "phoneme": "a", "lettres": "a" }, { "phoneme": "r", "lettres": "r" }, { "phoneme": "q_caduc", "lettres": "e" }, { "phoneme": "verb_3p", "lettres": "nt" }] }],
        objections:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "o", "lettres": "o" }, { "phoneme": "b", "lettres": "b" }, { "phoneme": "z^", "lettres": "j" }, { "phoneme": "e^_comp", "lettres": "e" }, { "phoneme": "k", "lettres": "c" }, { "phoneme": "s_t", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "o", "lettres": "o" }, { "phoneme": "b", "lettres": "b" }, { "phoneme": "z^", "lettres": "j" }, { "phoneme": "e^_comp", "lettres": "e" }, { "phoneme": "k", "lettres": "c" }, { "phoneme": "t", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] }],
        relations:
            [{ precedent: LireCouleur.determinant, codage: [{ "phoneme": "r", "lettres": "r" }, { "phoneme": "q", "lettres": "e" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "a", "lettres": "a" }, { "phoneme": "s_t", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] },
            { precedent: LireCouleur.pronom, codage: [{ "phoneme": "r", "lettres": "r" }, { "phoneme": "q", "lettres": "e" }, { "phoneme": "l", "lettres": "l" }, { "phoneme": "a", "lettres": "a" }, { "phoneme": "t", "lettres": "t" }, { "phoneme": "j", "lettres": "i" }, { "phoneme": "o~", "lettres": "on" }, { "phoneme": "#", "lettres": "s" }] }],
        est:
            [{ precedent: LireCouleur.pronom, codage: [{ "phoneme": "e^_comp", "lettres": "est" }] },
            { precedent: LireCouleur.determinant, codage: [{ "phoneme": "e^_comp", "lettres": "e" }, { "phoneme": "s", "lettres": "s" }, { "phoneme": "t", "lettres": "t" }] }],
        as:
            [{ precedent: LireCouleur.pronom, codage: [{ "phoneme": "a", "lettres": "a" }, { "phoneme": "#", "lettres": "s" }] },
            { precedent: LireCouleur.determinant, codage: [{ "phoneme": "a", "lettres": "a" }, { "phoneme": "s", "lettres": "s" }] }],
    };

    static dernierTraitement = "";

    constructor() {
    }

    /*
     * Règle spécifique de traitement des successions de lettres finales 'ient'
     * sert à savoir si la séquence 'ient' se prononce [i][#] ou [j][e~]
     */
    static regle_ient(mot, pos_mot) {
        if ((mot.slice(-5).match(/[bcçdfghjklnmpqrstvwxz]ient/) === null) || (pos_mot < mot.length - 4)) {
            // le mot ne se termine pas par 'ient' (précédé d'une consonne)
            // ou alors on est en train d'étudier une lettre avant la terminaison en 'ient'
            return false;
        }

        // il faut savoir si le mot est un verbe dont l'infinitif se termine par 'ier' ou non
        let pseudo_infinitif = mot.substring(0, mot.length - 2) + 'r';
        if (LireCouleur.verbes_ier.indexOf(pseudo_infinitif) >= 0) {
            return true;
        }
        pseudo_infinitif = chaine_sans_accent(mot).substring(0, mot.length - 2) + 'r';
        if ((pseudo_infinitif.length > 1) && (pseudo_infinitif[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            pseudo_infinitif = pseudo_infinitif.slice(2);
        }
        return (LireCouleur.verbes_ier.indexOf(pseudo_infinitif) >= 0);
    }

    /*
     * Règle spécifique de traitement des successions de lettres '*ent'
     * sert à savoir si le mot figure dans les mots qui se prononcent a~ à la fin
     */
    static regle_mots_ent(mot, pos_mot) {
        if (mot.match(/^[bcdfghjklmnpqrstvwxz]ent(s?)$/) !== null) {
            return true;
        }

        // il faut savoir si le mot figure dans la liste des adverbes ou des noms répertoriés
        let comparateur = mot;
        if (mot[mot.length - 1] == 's') {
            comparateur = mot.substring(0, mot.length - 1);
        }
        if (pos_mot + 2 < comparateur.length) {
            return false;
        }

        if ((comparateur.length > 1) && (comparateur[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            comparateur = comparateur.slice(2);
        }

        // comparaison directe avec la liste de mots où le 'ent' final se prononce [a~]
        if (LireCouleur.mots_ent.indexOf(comparateur) >= 0) {
            return true;
        }

        // comparaison avec la liste de verbes qui se terminent par 'enter'
        let pseudo_verbe = comparateur + 'er';
        return (LireCouleur.verbes_enter.indexOf(pseudo_verbe) >= 0);
    }

    /*
     * Règle spécifique de traitement des successions de lettres 'ment'
     * sert à savoir si le mot figure dans les mots qui se prononcent a~ à la fin
     */
    static regle_ment(mot, pos_mot) {
        if ((mot.slice(-4).match(/ment/) === null) || (pos_mot < mot.length - 3)) {
            // le mot ne se termine pas par 'ment'
            // ou alors on est en train d'étudier une lettre avant la terminaison en 'ment'
            return false;
        }

        // il faut savoir si le mot est un verbe dont l'infinitif se termine par 'ier' ou non
        let pseudo_infinitif = chaine_sans_accent(mot).substring(0, mot.length - 2) + 'r';
        if ((pseudo_infinitif.length > 1) && (pseudo_infinitif[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            pseudo_infinitif = pseudo_infinitif.slice(2);
        }
        if (LireCouleur.verbes_mer.indexOf(pseudo_infinitif) > -1) {
            return false;
        }

        // dernier test : le verbe dormir (ils/elles dorment)
        return (mot.slice(-7) !== 'dorment');
    }

    static regle_verbe_mer(mot, pos_mot) {
        // L'inverse de la règle ci-dessus ou presque
        if ((mot.slice(-4).match(/ment/) === null) || (pos_mot < mot.length - 3)) {
            // le mot ne se termine pas par 'ment'
            // ou alors on est en train d'étudier une lettre avant la terminaison en 'ment'
            return false;
        }

        return (!LireCouleur.regle_ment(mot, pos_mot));
    }

    /*
     * Règle spécifique de traitement des successions de lettres finales 'er'
     * sert à savoir si le mot figure dans la liste des exceptions
     */
    static regle_er(mot, pos_mot) {
        // prendre le mot au singulier uniquement
        let m_sing = mot;
        if (mot[mot.length - 1] == 's') {
            m_sing = mot.substring(0, mot.length - 1);
        }

        if ((m_sing.length > 1) && (m_sing[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            m_sing = m_sing.slice(2);
        }

        // tester la terminaison
        if ((mot.slice(-4).match(/er/) === null) || (pos_mot < mot.length - 2)) {
            // le mot ne se termine pas par 'er'
            // ou alors on est en train d'étudier une lettre avant la terminaison en 'er'
            return false;
        }

        return (LireCouleur.exceptions_final_er.indexOf(m_sing) > -1);
    }

    /*
     * Règle spécifique de traitement des noms communs qui se terminent par 'ai'
     * Dans les verbes terminés par 'ai', le phonème est 'é'
     * Dans les noms communs terminés par 'ai', le phonème est 'ê'
     */
    static regle_nc_ai_final(mot, pos_mot) {
        let m_seul = mot;
        if ((m_seul.length > 1) && (m_seul[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            m_seul = m_seul.slice(2);
        }

        if (LireCouleur.possibles_nc_ai_final.indexOf(m_seul) >= 0) {
            return (pos_mot == mot.length - 1);
        }
        return false;
    }

    /*
     * Règle spécifique de traitement des successions de lettres 'eu('
     * Sert à savoir si le mot est le verbe avoir conjugué (passé simple, participe
     * passé ou subjonctif imparfait
     */
    static regle_avoir(mot, pos_mot) {
        if (LireCouleur.possibles_avoir.indexOf(mot) >= 0) {
            return (pos_mot < 2);
        }
        return false;
    }

    /*
     * Règle spécifique de traitement des mots qui se terminent par "us".
     * Pour un certain nombre de ces mots, le 's' final se prononce.
     */
    static regle_s_final(mot, pos_mot) {
        let m_seul = mot;
        if ((m_seul.length > 1) && (m_seul[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            m_seul = m_seul.slice(2);
        }

        return (LireCouleur.mots_s_final.indexOf(m_seul) >= 0);
    }

    /*
     * Règle spécifique de traitement des mots qui se terminent par la lettre "t" prononcée.
     */
    static regle_t_final(mot, pos_mot) {
        // prendre le mot au singulier uniquement
        let m_sing = mot;
        if (mot[mot.length - 1] == 's') {
            m_sing = mot.substring(0, mot.length - 1);
        }

        if ((m_sing.length > 1) && (m_sing[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            m_sing = m_sing.slice(2);
        }

        return (LireCouleur.mots_t_final.indexOf(m_sing) > -1);
    }

    /*
     * Règle spécifique de traitement d'une finale de mon en "en"
     * abdomen, dolmen,  gentlemen,  golden,  pollen,  spécimen,  zen
     */
    static regle_en_final(mot, pos_mot) {
        // prendre le mot au singulier uniquement
        let m_sing = mot;
        if (mot[mot.length - 1] == 's') {
            m_sing = mot.substring(0, mot.length - 1);
        }

        if ((m_sing.length > 1) && (m_sing[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            m_sing = m_sing.slice(2);
        }

        return (LireCouleur.exceptions_en_final.indexOf(m_sing) > -1);
    }

    /*
     * Règle spécifique de traitement de quelques mots qui se terminent par 'tien' et
     * dans lesquels le 't' se prononce [t]
     */
    static regle_tien(mot, pos_mot) {
        // prendre le mot au singulier uniquement
        let m_sing = mot;
        if (m_sing[mot.length - 1] == 's') {
            m_sing = mot.substring(0, mot.length - 1);
        }

        // tester la terminaison
        if ((m_sing.slice(-4).match(/tien/) === null) || (pos_mot < m_sing.length - 4)) {
            // le mot ne se termine pas par 'tien'
            // ou alors on est en train d'étudier une lettre avant la terminaison en 'tien'
            return false;
        }

        // il faut savoir si le mot figure dans la liste des exceptions
        return (LireCouleur.exceptions_final_tien.indexOf(m_sing) > -1);
    }

    /*
     * Règle spécifique de traitement des successions de lettres finales 'er'
     * sert à savoir si le mot figure dans la liste des exceptions
     */
    static regle_er(mot, pos_mot) {
        // prendre le mot au singulier uniquement
        let m_sing = mot;
        if (mot[mot.length - 1] == 's') {
            m_sing = mot.substring(0, mot.length - 1);
        }

        if ((m_sing.length > 1) && (m_sing[1] == '@')) {
            // mot précédé d'un déterminant élidé - codage de l'apostrophe : voir pretraitement_texte
            m_sing = m_sing.slice(2);
        }

        // tester la terminaison
        if ((mot.slice(-4).match(/er/) === null) || (pos_mot < mot.length - 2)) {
            // le mot ne se termine pas par 'er'
            // ou alors on est en train d'étudier une lettre avant la terminaison en 'er'
            return false;
        }

        return (LireCouleur.exceptions_er_final.indexOf(m_sing) > -1);
    }

    /**
     * prise en compte de quelques homographes non homophones
     * @param {*} mot mot à tester
     */
    static testeHomographeNonHomophone(mot) {
        let pmot = LireCouleur.dernierTraitement;
        if (mot in LireCouleur.homographesNonHomophones) {
            let choix = LireCouleur.homographesNonHomophones[mot];
            let k = 0;
            for (let i = 0; i < choix.length; i++) {
                if (choix[i].precedent.indexOf(pmot) >= 0) {
                    k = i;
                    break;
                }
            }
            //console.log(pmot, mot, k, JSON.stringify(choix[k].codage));
            return LireCouleur.jsonToPhonemes(choix[k].codage);
        }
        return false;
    }

    /*
     * Teste l'application d'une règle
     */
    static teste_regle(nom_regle, cle, mot, pos_mot) {

        // console.log(nom_regle, ' fonction - clé[+] : '+cle['+']+' - clé[-] : '+cle['-']);
        if (typeof cle === 'string' || cle instanceof String) {
            // la regle est une fonction spécifique
            return LireCouleur[cle](mot, pos_mot);
        }

        // exemples : '+':'n|m' ou '-':'[aeiou]'
        let trouve_s = true;
        let trouve_p = true;

        if (typeof (cle['+']) !== "undefined") {
            if (typeof cle['+'] === 'string' || cle['+'] instanceof String) {
                cle['+'] = new RegExp(cle['+']);
            }
            // console.log(nom_regle, ' cle + testee : '+cle['+']);
            // il faut lire les lettres qui suivent
            // recherche le modèle demandé au début de la suite du mot
            let res = cle['+'].exec(mot.slice(pos_mot));
            trouve_s = ((res !== null) && (res.index == 0));
        }

        if (typeof (cle['-']) !== "undefined") {
            if (typeof cle['-'] === 'string' || cle['-'] instanceof String) {
                cle['-'] = new RegExp(cle['-']);
            }
            // console.log(nom_regle, ' cle - testee : '+cle['+']);
            trouve_p = false;
            // teste si la condition inclut le début du mot ou seulement les lettres qui précèdent
            if (cle['-'].source[0] == '^') {
                // le ^ signifie 'début de chaîne' et non 'tout sauf'
                if (cle['-'].source.length == 1) {
                    // on vérifie que le début de mot est vide
                    trouve_p = (pos_mot == 1);
                } else {
                    // le début du mot doit correspondre au pattern
                    let res = cle['-'].exec(mot.substring(0, pos_mot - 1));
                    if (res !== null) {
                        trouve_p = (res[0].length == pos_mot - 1);
                    }
                }
            }
            else {
                let k = pos_mot - 2;
                while ((k > -1) && (!trouve_p)) {
                    // il faut lire les lettres qui précèdent
                    // recherche le modèle demandé à la fin du début du mot
                    let res = cle['-'].exec(mot.substring(k, pos_mot - 1));
                    if (res !== null) {
                        trouve_p = (res[0].length == res.input.length);
                    }
                    k -= 1;
                }
            }
        }

        /* if (trouve_p & trouve_s) {
            console.log('mot:'+mot+'['+(pos_mot-1).toString()+'] ; lettre:'+mot[pos_mot-1]+' ; regle appliquee:'+nom_regle+' ; clef utilisee:'+cle);
        }*/

        return (trouve_p & trouve_s);
    }

    /*
     * Post traitement pour déterminer si le son [o] est ouvert ou fermé
     */
    static post_traitement_o_ouvert_ferme(pp) {
        if ((pp.constructor !== Array) || (pp.length == 1)) {
            return pp;
        }

        if (pp.filter(function (phon, index, array) { return (phon.phoneme == 'o'); }) > 0) {
            // pas de 'o' dans le mot
            return pp;
        }

        // mots en 'osse' qui se prononcent avec un o ouvert
        let mots_osse = ["cabosse", "carabosse", "carrosse", "colosse", "molosse", "cosse", "crosse", "bosse", "brosse", "rhinocéros", "désosse", "fosse", "gosse", "molosse", "écosse", "rosse", "panosse"];

        // indice du dernier phonème prononcé
        let npp = clone_tableau(pp);
        while ((npp.length > 0) && (syllaphon["#"].includes(npp[npp.length - 1].phoneme))) {
            npp.pop();
        }

        // reconstitution du mot sans les phonèmes muets à la fin
        let mot = "";
        npp.forEach(function (element, index, array) {
            mot += element.lettres;
        });

        if (mots_osse.indexOf(mot) > -1) {
            // certains mots en 'osse' on un o ouvert
            pp.forEach(function (element, index, array) {
                if (element.phoneme == 'o') {
                    pp[index].phoneme = 'o_ouvert';
                }
            });
            return pp;
        }

        // consonnes qui rendent possible un o ouvert en fin de mot
        let consonnes_syllabe_fermee = ['p', 'k', 'b', 'd', 'g', 'f', 'f_ph', 's^', 'l', 'r', 'm', 'n'];

        npp.forEach(function (element, i_ph, array) {
            if (element.phoneme == 'o') {
                if (i_ph == npp.length - 1) {
                    // syllabe tonique ouverte (rien après ou phonème muet) en fin de mot : o fermé
                    return pp;
                }

                if (element.lettres != 'ô') {
                    // syllabe tonique fermée (présence de consonne après) en fin de mot : o ouvert
                    let cas1 = ((i_ph == npp.length - 3) && (consonnes_syllabe_fermee.indexOf(pp[i_ph + 1].phoneme) > -1) && (pp[i_ph + 2].phoneme == 'q_caduc'));
                    // o ouvert lorsqu’il est suivi d’un [r] : or, cor, encore, dort, accord
                    // o ouvert lorsqu’il est suivi d’un [z^_g] : loge, éloge, horloge
                    // o ouvert lorsqu’il est suivi d’un [v] : ove, innove.
                    let cas2 = ((i_ph < pp.length - 1) && (['r', 'z^_g', 'v'].indexOf(pp[i_ph + 1].phoneme) > -1));
                    // un o suivi de 2 phonemes consonnes est un o ouvert
                    let cas3 = ((i_ph < pp.length - 2) && (syllaphon['c'].indexOf(pp[i_ph + 1].phoneme) > -1) && (syllaphon['c'].indexOf(pp[i_ph + 2].phoneme) > -1));

                    if (cas1 || cas2 || cas3) {
                        pp[i_ph].phoneme = 'o_ouvert';
                    }
                }
            }
        });

        return pp;
    }

    /*
     * Post traitement la constitution d'allophones des phonèmes avec yod
     * référence : voir http://andre.thibault.pagesperso-orange.fr/PhonologieSemaine10.pdf (cours du 3 février 2016)
     */
    static post_traitement_yod(pp) {
        if ((pp.constructor !== Array) || (pp.length == 1)) {
            return pp;
        }

        if (pp.filter(function (phon, index, array) { return (['i'].indexOf(phon.phoneme) >= 0); }) > 0) {
            // pas de 'yod' dans le mot
            return pp;
        }

        let phon_suivant = ['a', 'a~', 'e', 'e^', 'e_comp', 'e^_comp', 'o', 'o_comp', 'o~', 'e~', 'x', 'x^', 'u'];

        pp.forEach(function (element, i_ph, array) {
            if (['i'].indexOf(element.phoneme) >= 0) {
                if (i_ph == pp.length - 1) {
                    // fin de mot (bizarre d'ailleurs !)
                    return pp;
                }

                // test du phonème suivant => transformation du [i] en [j]
                if (phon_suivant.indexOf(pp[i_ph + 1].phoneme) > -1) {
                    pp[i_ph].phoneme = 'j';
                }
            }
        });

        return pp;
    }

    /*
     * Post traitement pour déterminer si le son [x] est ouvert "e" ou fermé "eu"
     */
    static post_traitement_e_ouvert_ferme(pp) {
        if ((pp.constructor !== Array) || (pp.length < 2)) {
            return pp;
        }

        if (pp.filter(function (phon, index, array) { return (phon.phoneme == 'x'); }) > 0) {
            // pas de 'x' dans le mot
            return pp;
        }

        // indice du dernier phonème prononcé
        let lpp = pp.length - 1;
        while ((lpp > 0) && (syllaphon["#"].includes(pp[lpp].phoneme))) {
            lpp -= 1;
        }

        // on ne s'intéresse qu'au dernier phonème (pour les autres, on ne peut rien décider)
        let i_ph = pp.map(function (phon) { return phon.phoneme; }).lastIndexOf('x');

        if (i_ph < lpp - 2) {
            // le phonème n'est pas l'un des 3 derniers du mot : on ne peut rien décider
            return pp;
        }

        if (i_ph == lpp) {
            // le dernier phonème prononcé dans le mot est le 'eu' donc 'eu' fermé
            pp[i_ph].phoneme = 'x^';
            return pp;
        }

        // le phonème est l'avant dernier du mot (syllabe fermée)
        let consonnes_son_eu_ferme = ['z', 'z_s', 't'];
        if ((consonnes_son_eu_ferme.indexOf(pp[i_ph + 1].phoneme) > -1) && (pp[lpp].phoneme == 'q_caduc')) {
            try {
                pp[i_ph].phoneme = 'x^';
            } catch (err) {
                console.log(pp);
                console.log(i_ph);
            }
        }

        return pp;
    }

    static jsonToPhonemes(json) {
        let codage = [];
        for (let i = 0; i < json.length; i++) {
            codage.push(new LCPhoneme(json[i].phoneme, json[i].lettres));
        }
        return codage;
    }

    /*
     * Décodage d'un mot sous la forme d'une suite de phonèmes
     */
    static extrairePhonemes(mot, lecteur_deb, para, p_para) {
        let p_mot = 0;
        let codage = new Array();
        let phoneme, pas, lettre;
        let trouve, i, k;
        let np_para = p_para;
        let motmin = mot.toLowerCase();

        let hnh = this.testeHomographeNonHomophone(motmin);
        if (hnh) {
            k = 0;
            for (i = 0; i < hnh.length; i++) {
                codage.push(new LCPhoneme(hnh[i].phoneme, mot.slice(k, k + hnh[i].lettres.length)));
                k += hnh[i].lettres.length;
            }
        } else {
            if (typeof (para) === "undefined") {
                para = mot;
            }
            if (typeof (p_para) === "undefined") {
                np_para = 0;
            }
            while (p_mot < mot.length) {
                // On teste d'application des règles de composition des sons
                lettre = motmin[p_mot];
                // console.log('lettre : '+lettre);

                trouve = false;
                if (lettre in LireCouleur.autom) {
                    let aut = LireCouleur.autom[lettre][1];
                    i = 0;
                    while ((!trouve) && (i < LireCouleur.autom[lettre][0].length)) {
                        k = LireCouleur.autom[lettre][0][i];
                        //console.log('teste regle :', aut[k][0]);
                        if (LireCouleur.teste_regle(k, aut[k][0], motmin, p_mot + 1)) {
                            phoneme = aut[k][1];
                            pas = aut[k][2];
                            codage.push(new LCPhoneme(phoneme, para.substring(np_para, np_para + pas)));
                            //console.log('phoneme:' + phoneme + ' ; lettre(s) lue(s):' + para.substring(np_para, np_para + pas));
                            p_mot += pas;
                            np_para += pas;
                            trouve = true;
                        }
                        i += 1;
                    }
                    // console.log('trouve:'+trouve.toString()+' - '+codage.toString());

                    if ((!trouve) && (p_mot == mot.length - 1) && aut.hasOwnProperty('@')) {
                        if (p_mot == mot.length - 1) {
                            // c'est la dernière lettre du mot, il faut vérifier que ce n'est pas une lettre muette
                            phoneme = aut['@'][1];
                            pas = 1;
                            codage.push(new LCPhoneme(phoneme, lettre));
                            trouve = true;
                            p_mot += 1;
                            np_para += 1;
                            // console.log('phoneme fin de mot:'+phoneme+' ; lettre lue:'+lettre);
                        }
                    }

                    // rien trouvé donc on prend le phonème de base ('*')
                    if (!trouve) {
                        try {
                            phoneme = aut['*'][1];
                            pas = aut['*'][2];
                            codage.push(new LCPhoneme(phoneme, para.substring(np_para, np_para + pas)));
                            np_para += pas;
                            p_mot += pas;
                            // console.log('phoneme par defaut:'+phoneme+' ; lettre lue:'+lettre);
                        }
                        catch (e) {
                            codage.push(new LCPhoneme(null, lettre));
                            np_para += 1;
                            p_mot += 1;
                            // console.log('non phoneme ; caractere lu:'+lettre);
                        }
                    }
                }
                else {
                    codage.push(new LCPhoneme(null, lettre));
                    p_mot += 1;
                    np_para += 1;
                    // console.log('non phoneme ; caractere lu:'+lettre);
                }
            }
        }
        // console.log('--------------------');
        // console.log(codage);
        // console.log('--------------------');

        // post traitement pour associer yod + [an, in, en, on, a, é, etc.]
        let nldecdeb = true;
        if (typeof (lecteur_deb) !== "undefined") nldecdeb = !lecteur_deb;
        if (nldecdeb) codage = LireCouleur.post_traitement_yod(codage);

        // post traitement pour différencier les o ouverts et les o fermés
        codage = LireCouleur.post_traitement_o_ouvert_ferme(codage);

        // post traitement pour différencier les eu ouverts et les eu fermés
        codage = LireCouleur.post_traitement_e_ouvert_ferme(codage);

        // console.log('--------------------');
        // codage.forEach(function(element, i_ph, array) {
        //	console.log(element.phoneme, element.lettres);
        // });
        // console.log('--------------------');

        LireCouleur.dernierTraitement = motmin;

        return codage;
    }

    /*
     * Décodage d'un mot sous la forme d'une suite de phonèmes
     */
    static extraireSyllabes(phonemes, std_lc, oral_ecrit) {
        let i, j, k;
        let phon, phon1, phon2;

        if (typeof (std_lc) === "undefined") {
            std_lc = 'std';
        }
        if (typeof (oral_ecrit) === "undefined") {
            oral_ecrit = 'ecrit';
        }

        let nb_phon = phonemes.length;
        if (nb_phon < 2) {
            let syll = new LCSyllabe();
            syll.ajoutePhonemes(phonemes);
            return [syll];
        }

        let nphonemes = new Array();
        if (std_lc == 'std') {
            // Si le décodage est standard dupliquer les phonèmes qui comportent des consonnes doubles
            for (i = 0; i < nb_phon; i++) {
                let phon = phonemes[i];
                if (phon.estConsonneRedoublee()) {
                    // consonne redoublée
                    phon.dedoublerConsonnes()
                    nphonemes.push(phon);
                    nphonemes.push(phon);
                }
                else {
                    nphonemes.push(phon);
                }
            }
        }
        else {
            nphonemes = clone_tableau(phonemes);
        }
        nb_phon = nphonemes.length;

        // console.log('--------------------'+nphonemes.toString()+'--------------------')
        // préparer la liste de syllabes
        let sylph = new Array();
        for (i = 0; i < nb_phon; i++) {
            phon = nphonemes[i];
            if (phon.estPhoneme()) {
                if (phon.estUneVoyelle()) {
                    sylph.push(['v', [i]]);
                }
                else if (phon.estSemiConsonne()) {
                    sylph.push(['v', [i]]);
                }
                else if (phon.estUneConsonne()) {
                    sylph.push(['c', [i]]);
                }
                else if (phon.estSemiVoyelle()) {
                    sylph.push(['s', [i]]);
                }
                else {
                    // c'est un phonème muet : '#'
                    sylph.push(['#', [i]]);
                }
            }
        }

        // mixer les doubles phonèmes de consonnes qui incluent [l] et [r] ; ex. : bl, tr, cr, chr, pl
        i = 0;
        while (i < sylph.length - 1) {
            if ((sylph[i][0] == 'c') && (sylph[i + 1][0] == 'c')) {
                // deux phonèmes consonnes se suivent
                let phon0 = nphonemes[sylph[i][1][0]];
                let phon1 = nphonemes[sylph[i + 1][1][0]];
                if (((phon1.phoneme == 'l') || (phon1.phoneme == 'r')) && (['b', 'k', 'p', 't', 'g', 'd', 'f', 'v'].indexOf(phon0.phoneme) >= 0)) {
                    // mixer les deux phonèmes puis raccourcir la chaîne
                    sylph[i][1].push.apply(sylph[i][1], sylph[i + 1][1]);
                    sylph.splice(i + 1, 1);
                }
            }
            i += 1;
        }
        // console.log("mixer doubles phonèmes consonnes (bl, tr, cr, etc.) :"+sylph.toString());

        // mixer les doubles phonèmes [y] et [i], [u] et [i,e~,o~]
        i = 0;
        while (i < sylph.length - 1) {
            if ((sylph[i][0] == 'v') && (sylph[i + 1][0] == 'v')) {
                // deux phonèmes voyelles se suivent
                let phon1 = nphonemes[sylph[i][1][0]];
                let phon2 = nphonemes[sylph[i + 1][1][0]];
                if (((phon1.phoneme == 'y') && (phon2.phoneme == 'i')) || ((phon1.phoneme == 'u') && (['i', 'e~', 'o~'].indexOf(phon2.phoneme) >= 0))) {
                    // mixer les deux phonèmes puis raccourcir la chaîne
                    sylph[i][1].push.apply(sylph[i][1], sylph[i + 1][1]);
                    sylph.splice(i + 1, 1);
                }
            }
            i += 1;
        }
        // console.log("mixer doubles phonèmes voyelles ([y] et [i], [u] et [i,e~,o~]) :"+sylph.toString());

        // accrocher les lettres muettes aux lettres qui précèdent
        i = 0
        while (i < sylph.length - 1) {
            if (sylph[i + 1][0] == '#') {
                // mixer les deux phonèmes puis raccourcir la chaîne
                sylph[i][1].push.apply(sylph[i][1], sylph[i + 1][1]);
                sylph.splice(i + 1, 1);
            }
            i += 1;
        }

        // construire les syllabes par association de phonèmes consonnes et voyelles
        let sylls = new Array();
        let nb_sylph = sylph.length;
        i = j = 0;
        while (i < nb_sylph) {
            // début de syllabe = tout ce qui n'est pas voyelle
            j = i;
            while ((i < nb_sylph) && (sylph[i][0] != 'v')) {
                i += 1;
            }

            // inclure les voyelles
            let cur_syl = new LCSyllabe(nphonemes);
            if ((i < nb_sylph) && (sylph[i][0] == 'v')) {
                i += 1;
                for (k = j; k < i; k++) {
                    cur_syl.ajoutePhonemes(sylph[k][1], nphonemes);
                }
                j = i;

                // ajouter la syllabe à la liste
                sylls.push(cur_syl);
            }

            // la lettre qui suit est une consonne
            if (i + 1 < nb_sylph) {
                let lettre1 = nphonemes[sylph[i][1][sylph[i][1].length - 1]].lettres;
                let lettre2 = nphonemes[sylph[i + 1][1][0]].lettres[0];
                lettre1 = lettre1[lettre1.length - 1];
                if (('bcdfghjklmnpqrstvwxzç'.indexOf(lettre1) > -1) && ('bcdfghjklmnpqrstvwxzç'.indexOf(lettre2) > -1)) {
                    // inclure cette consonne si elle est suivie d'une autre consonne
                    cur_syl.ajoutePhonemes(sylph[i][1], nphonemes);
                    i += 1;
                    j = i;
                }
            }
        }

        // précaution de base : si pas de syllabes reconnues, on concatène simplement les phonèmes
        if (sylls.length == 0) {
            let syll = new LCSyllabe();
            syll.ajoutePhonemes(phonemes);
            return [syll];
        }

        // il ne doit rester à la fin que les lettres muettes ou des consonnes qu'on ajoute à la dernière syllabe
        for (k = j; k < nb_sylph; k++) {
            sylls[sylls.length - 1].ajoutePhonemes(sylph[k][1], nphonemes);
        }

        if ((oral_ecrit == 'oral') && (sylls.length > 1)) {
            // syllabes orales : si la dernière syllabe est finalisée par des lettres muettes ou
            // un e caduc, il faut la concaténer avec la syllabe précédente
            let derniereSyllabe = sylls[sylls.length - 1];
            k = derniereSyllabe.phonemes.length - 1;
            while ((k > 0) && (['#', 'verb_3p'].indexOf(derniereSyllabe.phonemes[k].phoneme) >= 0)) {
                k -= 1;
            }
            if (derniereSyllabe.phonemes[k].phoneme == 'q_caduc') {
                // concaténer la dernière syllabe à l'avant-dernière
                sylls.pop();
                sylls[sylls.length - 1].phonemes.push.apply(sylls[sylls.length - 1].phonemes, derniereSyllabe.phonemes);
            }
        }

        return sylls;
    }

    /*
     * Indique s'il y a la possibilité d'une liaison en amont de ce mot
     */
    static liaisonAmont(phonemes) {
        return ((phonemes[0].estUneVoyelle()) || (phonemes[0].phoneme == "#_h_muet"));
    }

    /*
     * Indique s'il y a la possibilité d'une liaison en aval de ce mot
     */
    static liaisonAval(mot) {
        let listeMotsLiaison = ["un", "des", "les", "ces", "mon", "ton", "son", "mes",
            "tes", "ses", "nos", "vos", "leurs", "aux", "aucun", "tout", "quels",
            "quelles", "quelques", "deux", "trois", "six", "dix", "vingt", "on", "nous",
            "vous", "ils", "elles", "plus", "très", "bien", "quand", "comment", "dans",
            "chez", "sans", "en", "sous", "sur"];
        return listeMotsLiaison.includes(mot.toLowerCase());
    }
}
