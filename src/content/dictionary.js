// URL du dictionnaire de fréquence des mots
const DICTIONARY_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/fr/fr_50k.txt";

let dictionary = [];
let dictionarySet = null;
let isDictionaryLoaded = false;

// Fonction pour charger le dictionnaire
async function loadDictionary() {
    try {
        const response = await fetch(DICTIONARY_URL);
        const text = await response.text();
        const lines = text.split(/\r?\n/);
        const temp = [];
        for (const line of lines) {
            if (!line.trim()) continue;
            const [rawWord, freqStr] = line.split(/\s+/);
            if (!rawWord) continue;
            const freq = parseInt(freqStr, 10) || 0;
            temp.push({ word: rawWord.toLowerCase(), freq });
        }
        dictionary = temp;
        dictionarySet = new Set(temp.map(item => item.word));
        isDictionaryLoaded = true;
        console.log("[ArckchuallyCorrector] Dictionnaire chargé:", dictionary.length, "mots.");
    } catch (err) {
        console.error("[ArckchuallyCorrector] Erreur chargement dictionnaire:", err);
    }
}

// Vérifie si le dictionnaire est chargé
function isDictionaryLoaded() {
    return isDictionaryLoaded;
}

// Retourne le dictionnaire
function getDictionary() {
    return dictionary;
}

// Retourne l'ensemble des mots du dictionnaire
function getDictionarySet() {
    return dictionarySet;
}

export { loadDictionary, isDictionaryLoaded, getDictionary, getDictionarySet };