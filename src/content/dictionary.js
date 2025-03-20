import { cleanWord } from './morphology.js';

const DICTIONARY_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/fr/fr_50k.txt";

let dictionary = [];
let dictionarySet = null;
let dictionaryLoaded = false;

// Fonction pour charger le dictionnaire
export async function loadDictionary() {
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
        dictionaryLoaded = true;
        console.log("[ArckchuallyCorrector] Dictionnaire chargé:", dictionary.length, "mots.");
    } catch (err) {
        console.error("[ArckchuallyCorrector] Erreur chargement dictionnaire:", err);
    }
}

export function isDictionaryLoaded() {
    return dictionaryLoaded;
}

export function getDictionary() {
    return dictionary;
}

export function getDictionarySet() {
    return dictionarySet;
}

// Fonction utilitaire : calcule la distance de Levenshtein entre deux chaînes
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,       // insertion
                    matrix[i - 1][j] + 1        // suppression
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// Fonction pour trouver une suggestion pour un mot mal orthographié
export function findSingleSuggestion(word) {
    const cleaned = cleanWord(word);
    if (!dictionarySet) return null;
    let suggestion = null;
    let minDistance = Infinity;
    for (const entry of dictionary) {
        const candidate = entry.word;
        const distance = levenshteinDistance(cleaned, candidate);
        if (distance < minDistance) {
            minDistance = distance;
            suggestion = candidate;
        }
    }
    // Retourne la suggestion seulement si la distance minimale est raisonnable (ici ≤ 2)
    if (minDistance <= 2) {
        return suggestion;
    }
    return null;
}
