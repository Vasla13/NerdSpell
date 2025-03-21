export function cleanWord(w) {
    return w
      .replace(/[.,!?;:"()«»']/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }
  
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
  
  // Vérifie si un mot est valide en tenant compte de ses bases morphologiques
  export function estMotValideAvecMorphologie(mot, dictionnaireSet) {
    const motNettoye = cleanWord(mot);
    if (dictionnaireSet.has(motNettoye)) return true;
    const bases = getMorphologicalBases(motNettoye);
    for (const base of bases) {
      if (dictionnaireSet.has(base)) return true;
    }
    return false;
  }
  