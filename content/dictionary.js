import { cleanWord } from './morphology.js';

// URL du dictionnaire de 50k mots français
const DICTIONNAIRE_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/fr/fr_50k.txt";

let dictionnaire = [];
let dictionnaireSet = null;
let dictionnaireCharge = false;

// Fonction pour charger le dictionnaire
export async function chargerDictionnaire() {
  try {
    const reponse = await fetch(DICTIONNAIRE_URL);
    const texte = await reponse.text();
    const lignes = texte.split(/\r?\n/);
    const temp = [];
    for (const ligne of lignes) {
      if (!ligne.trim()) continue;
      const [motBrut, freqStr] = ligne.split(/\s+/);
      if (!motBrut) continue;
      const freq = parseInt(freqStr, 10) || 0;
      temp.push({ mot: motBrut.toLowerCase(), freq });
    }
    dictionnaire = temp;
    dictionnaireSet = new Set(temp.map(item => item.mot));
    dictionnaireCharge = true;
    console.log("[ArckchuallyCorrector] Dictionnaire chargé:", dictionnaire.length, "mots.");
  } catch (err) {
    console.error("[ArckchuallyCorrector] Erreur lors du chargement du dictionnaire:", err);
  }
}

export function estDictionnaireCharge() {
  return dictionnaireCharge;
}

export function obtenirDictionnaire() {
  return dictionnaire;
}

export function obtenirDictionnaireSet() {
  return dictionnaireSet;
}

// Calcul de la distance de Levenshtein entre deux chaînes
function distanceLevenshtein(a, b) {
  const matrice = [];
  for (let i = 0; i <= b.length; i++) {
    matrice[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrice[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrice[i][j] = matrice[i - 1][j - 1];
      } else {
        matrice[i][j] = Math.min(
          matrice[i - 1][j - 1] + 1, // substitution
          matrice[i][j - 1] + 1,     // insertion
          matrice[i - 1][j] + 1      // suppression
        );
      }
    }
  }
  return matrice[b.length][a.length];
}

// Trouve une suggestion pour un mot mal orthographié
export function trouverSuggestion(mot) {
  const motNettoye = cleanWord(mot);
  if (!dictionnaireSet) return null;
  let suggestion = null;
  let distanceMin = Infinity;
  for (const entree of dictionnaire) {
    const candidat = entree.mot;
    const distance = distanceLevenshtein(motNettoye, candidat);
    if (distance < distanceMin) {
      distanceMin = distance;
      suggestion = candidat;
    }
  }
  // Retourne la suggestion seulement si la distance minimale est raisonnable (≤ 2)
  if (distanceMin <= 2) {
    return suggestion;
  }
  return null;
}
