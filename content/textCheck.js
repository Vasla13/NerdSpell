import { cleanWord, estMotValideAvecMorphologie } from './morphology.js';
import { trouverSuggestion } from './dictionary.js';

// Vérifie le texte et retourne les erreurs trouvées
export function verifierTexte(texte, dictionnaireSet) {
  const tokens = texte.split(/\s+/);
  const erreurs = [];
  for (const token of tokens) {
    const motNettoye = cleanWord(token);
    if (!motNettoye) continue;
    if (!estMotValideAvecMorphologie(token, dictionnaireSet)) {
      const suggestion = trouverSuggestion(token);
      erreurs.push({ wrong: token, suggestion });
    }
  }
  return erreurs;
}
