import { cleanWord, isWordValidWithMorphology } from './morphology.js';
import { findSingleSuggestion } from './dictionary.js';

// Fonction pour vérifier le texte et trouver les erreurs
export function checkText(text, dictionarySet) {
    const tokens = text.split(/\s+/);
    const errors = [];
    for (const token of tokens) {
        const cleaned = cleanWord(token);
        if (!cleaned) continue;
        if (!isWordValidWithMorphology(token, dictionarySet)) {
            const suggestion = findSingleSuggestion(token);
            errors.push({ wrong: token, suggestion });
        }
    }
    return errors;
}