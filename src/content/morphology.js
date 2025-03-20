// Fonction pour nettoyer un mot des caractères spéciaux
export function cleanWord(w) {
    return w
        .replace(/[.,!?;:"()«»']/g, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

// Fonction pour obtenir les bases morphologiques d'un mot
export function getMorphologicalBases(cw) {
    const bases = [cw];

    if (cw.endsWith("s") && cw.length > 2) {
        bases.push(cw.slice(0, -1));
    }
    if (cw.endsWith("es") && cw.length > 3) {
        bases.push(cw.slice(0, -2));
    }
    if (cw.endsWith("ent") && cw.length > 3) {
        bases.push(cw.slice(0, -3));
    }
    if (cw.endsWith("iez") && cw.length > 3) {
        bases.push(cw.slice(0, -3));
    }

    return Array.from(new Set(bases));
}