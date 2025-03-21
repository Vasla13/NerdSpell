// ==================== Dictionnaire ====================

const DICTIONNAIRE_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/fr/fr_50k.txt";

let dictionnaire = [];
let dictionnaireSet = null;
let dictionnaireCharge = false;

// Petit cache pour accélérer la recherche de suggestions
let suggestionsCache = Object.create(null);

/**
 * Nettoie une chaîne (retire la ponctuation, normalise, etc.),
 * mais ne supprime PAS l'apostrophe pour pouvoir gérer les contractions.
 */
function cleanWord(w) {
  return w
    // On ne retire pas ' ni ’
    .replace(/[.,!?;:"()«»]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Supprime la partie contractée au début du mot.
 * Ex : j'aimerais -> aimerais, l'ami -> ami, d'accord -> accord, qu'il -> il, etc.
 */
function removeLeadingApostrophe(word) {
  // On gère les cas courants de contraction en français
  // (et on tolère l’apostrophe ASCII ' ou typographique ’)
  const match = word.match(/^(l|j|t|s|qu|c|n|m|d)(?:'|’)(.*)$/i);
  if (match) {
    // match[2] = le reste du mot après l'apostrophe
    return match[2];
  }
  return word;
}

/**
 * Distance de Levenshtein (pour la suggestion)
 */
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
          matrice[i - 1][j - 1] + 1,
          matrice[i][j - 1] + 1,
          matrice[i - 1][j] + 1
        );
      }
    }
  }
  return matrice[b.length][a.length];
}

/**
 * Charge le dictionnaire (50k mots) depuis GitHub
 */
function chargerDictionnaire() {
  return fetch(DICTIONNAIRE_URL)
    .then((res) => res.text())
    .then((texte) => {
      const lignes = texte.split(/\r?\n/);
      const temp = [];
      for (const ligne of lignes) {
        if (!ligne.trim()) continue;
        const [motBrut, freqStr] = ligne.split(/\s+/);
        if (!motBrut) continue;
        temp.push({ mot: motBrut.toLowerCase(), freq: parseInt(freqStr, 10) || 0 });
      }
      dictionnaire = temp;
      dictionnaireSet = new Set(temp.map((item) => item.mot));
      dictionnaireCharge = true;
      console.log("[ArckchuallyCorrector] Dictionnaire chargé :", dictionnaire.length, "mots.");
    })
    .catch((err) => {
      console.error("[ArckchuallyCorrector] Erreur chargement dictionnaire :", err);
    });
}

/**
 * Suggestion de correction pour un mot mal orthographié
 * (distance de Levenshtein <= 2, filtrage par longueur)
 */
function trouverSuggestion(mot) {
  const motNettoye = cleanWord(mot);
  if (!dictionnaireSet) return null;

  if (suggestionsCache[motNettoye] !== undefined) {
    return suggestionsCache[motNettoye];
  }

  let suggestion = null;
  let distanceMin = Infinity;

  for (const entree of dictionnaire) {
    const candidat = entree.mot;
    if (Math.abs(candidat.length - motNettoye.length) > 2) {
      continue; // trop de différence de longueur, la distance sera > 2
    }
    const dist = distanceLevenshtein(motNettoye, candidat);
    if (dist < distanceMin) {
      distanceMin = dist;
      suggestion = candidat;
      if (distanceMin === 0) break;
    }
  }

  if (distanceMin <= 2) {
    suggestionsCache[motNettoye] = suggestion;
    return suggestion;
  }
  suggestionsCache[motNettoye] = null;
  return null;
}

// ==================== Morphologie ====================

/**
 * Renvoie les bases morphologiques d'un mot (singulier/pluriel/terminaisons)
 */
function getMorphologicalBases(cw) {
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

/**
 * Vérifie si un mot est valide en tenant compte de la morphologie
 * + gestion des apostrophes (contrations françaises)
 */
function estMotValideAvecMorphologie(mot, dicoSet) {
  const motNettoye = cleanWord(mot);

  // 1) Test direct
  if (dicoSet.has(motNettoye)) return true;
  const bases = getMorphologicalBases(motNettoye);
  for (const base of bases) {
    if (dicoSet.has(base)) return true;
  }

  // 2) Si pas trouvé, test sans la contraction (ex : j'aimerais -> aimerais)
  const motSansContr = removeLeadingApostrophe(motNettoye);
  if (motSansContr !== motNettoye) {
    if (dicoSet.has(motSansContr)) return true;
    const basesContr = getMorphologicalBases(motSansContr);
    for (const base of basesContr) {
      if (dicoSet.has(base)) return true;
    }
  }

  // Rien trouvé
  return false;
}

// ==================== Vérification du texte ====================

/**
 * Vérifie tout le texte et retourne les erreurs
 */
function verifierTexte(texte, dicoSet) {
  const tokens = texte.split(/\s+/);
  const erreurs = [];
  for (const token of tokens) {
    const motNettoye = cleanWord(token);
    if (!motNettoye) continue;
    if (!estMotValideAvecMorphologie(token, dicoSet)) {
      const suggestion = trouverSuggestion(token);
      erreurs.push({ wrong: token, suggestion });
    }
  }
  return erreurs;
}

// ==================== Popup ====================

function escapeHtml(str) {
  return str.replace(/[<>&"]/g, function(c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
    }
    return c;
  });
}

function afficherPopupErreur(element, erreurs) {
  let popup = element._arckchuallyPopup;
  if (!popup) {
    popup = document.createElement("div");
    popup.style.position = "fixed";
    popup.style.backgroundColor = "yellow";
    popup.style.border = "2px solid black";
    popup.style.padding = "10px";
    popup.style.borderRadius = "5px";
    popup.style.boxShadow = "3px 3px 7px rgba(0,0,0,0.3)";
    popup.style.zIndex = 999999;
    popup.style.fontSize = "15px";
    popup.style.maxWidth = "400px";
    popup.style.whiteSpace = "pre-wrap";
    popup.style.lineHeight = "1.2";

    const topBar = document.createElement("div");
    topBar.style.position = "relative";
    topBar.style.height = "20px";

    const closeBtn = document.createElement("span");
    closeBtn.textContent = "✖";
    closeBtn.style.color = "red";
    closeBtn.style.fontWeight = "bold";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "0";
    closeBtn.style.right = "0";
    closeBtn.dataset.action = "close-popup";
    topBar.appendChild(closeBtn);

    popup.appendChild(topBar);

    const messageDiv = document.createElement("div");
    messageDiv.dataset.role = "message";
    messageDiv.style.marginTop = "5px";
    popup.appendChild(messageDiv);

    popup.addEventListener("click", (ev) => {
      if (ev.target.dataset.action === "close-popup") {
        supprimerPopupErreur(element);
      }
    });

    document.body.appendChild(popup);
    element._arckchuallyPopup = popup;
  }

  const msgDiv = popup.querySelector("[data-role='message']");
  if (!msgDiv) return;

  const lignes = [];
  lignes.push("☝️🤓 Erm, arckchually…");
  for (const e of erreurs) {
    if (!e.suggestion) {
      lignes.push(`  - Le mot « ${escapeHtml(e.wrong)} » n'existe pas ou n'est pas reconnu.`);
    } else {
      lignes.push(`  - C'est « ${escapeHtml(e.suggestion)} », pas « ${escapeHtml(e.wrong)} ».`);
    }
  }
  msgDiv.innerHTML = lignes.join("<br/>");

  const rect = element.getBoundingClientRect();
  popup.style.top = (rect.bottom + 5) + "px";
  popup.style.left = rect.left + "px";
}

function supprimerPopupErreur(element) {
  if (element._arckchuallyPopup) {
    element._arckchuallyPopup.remove();
    delete element._arckchuallyPopup;
  }
}

// ==================== Initialisation ====================

const DELAI_DEBOUNCE = 600;
let timerDebounce = null;

chargerDictionnaire().then(() => {
  document.addEventListener("input", (e) => {
    const element = e.target;
    if (
      element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA" ||
      element.isContentEditable
    ) {
      if (timerDebounce) clearTimeout(timerDebounce);
      timerDebounce = setTimeout(() => {
        const texte = element.value !== undefined ? element.value : element.innerText;
        const erreurs = verifierTexte(texte, dictionnaireSet);
        if (erreurs.length > 0) {
          afficherPopupErreur(element, erreurs);
        } else {
          supprimerPopupErreur(element);
        }
      }, DELAI_DEBOUNCE);
    }
  }, true);

  document.addEventListener("blur", (e) => {
    supprimerPopupErreur(e.target);
  }, true);
});
