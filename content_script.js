/**********************************************
 *      Arckchually Corrector - Complet
 *      Version sans import/export
 **********************************************/

// ==================== Dictionnaire ====================

// URL du dictionnaire de 50k mots français (hermitdave)
const DICTIONNAIRE_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/fr/fr_50k.txt";

// Variables globales pour le dictionnaire
let dictionnaire = [];
let dictionnaireSet = null;
let dictionnaireCharge = false;

/**
 * Nettoie une chaîne (retire la ponctuation, normalise, etc.)
 * @param {string} w
 * @returns {string}
 */
function cleanWord(w) {
  return w
    .replace(/[.,!?;:"()«»']/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 * @param {string} a
 * @param {string} b
 * @returns {number}
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
          matrice[i - 1][j - 1] + 1, // substitution
          matrice[i][j - 1] + 1,     // insertion
          matrice[i - 1][j] + 1      // suppression
        );
      }
    }
  }
  return matrice[b.length][a.length];
}

/**
 * Charge le dictionnaire à partir d'une URL distante
 */
function chargerDictionnaire() {
  return fetch(DICTIONNAIRE_URL)
    .then((reponse) => reponse.text())
    .then((texte) => {
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
      dictionnaireSet = new Set(temp.map((item) => item.mot));
      dictionnaireCharge = true;
      console.log("[ArckchuallyCorrector] Dictionnaire chargé :", dictionnaire.length, "mots.");
    })
    .catch((err) => {
      console.error("[ArckchuallyCorrector] Erreur lors du chargement du dictionnaire :", err);
    });
}

/**
 * Renvoie true si le dictionnaire est chargé
 * @returns {boolean}
 */
function estDictionnaireCharge() {
  return dictionnaireCharge;
}

/**
 * Renvoie une suggestion (distance de Levenshtein ≤ 2) pour un mot mal orthographié
 * @param {string} mot
 * @returns {string|null}
 */
function trouverSuggestion(mot) {
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
  // On ne propose une suggestion que si elle est "assez proche" (≤ 2)
  if (distanceMin <= 2) {
    return suggestion;
  }
  return null;
}

// ==================== Morphologie ====================

/**
 * Renvoie les bases morphologiques d'un mot (ex : singulier -> pluriel)
 * @param {string} cw
 * @returns {string[]}
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
 * Vérifie si un mot est valide en tenant compte de ses bases morphologiques
 * @param {string} mot
 * @param {Set<string>} dicoSet
 * @returns {boolean}
 */
function estMotValideAvecMorphologie(mot, dicoSet) {
  const motNettoye = cleanWord(mot);
  if (dicoSet.has(motNettoye)) return true;
  const bases = getMorphologicalBases(motNettoye);
  for (const base of bases) {
    if (dicoSet.has(base)) return true;
  }
  return false;
}

// ==================== Vérification du texte ====================

/**
 * Vérifie le texte, détecte les mots non valides et propose une suggestion
 * @param {string} texte
 * @param {Set<string>} dicoSet
 * @returns {Array<{wrong: string, suggestion: string|null}>}
 */
function verifierTexte(texte, dicoSet) {
  const tokens = texte.split(/\s+/);
  const erreurs = [];
  for (const token of tokens) {
    const motNettoye = cleanWord(token);
    if (!motNettoye) continue;
    // Si le mot n'est pas dans le dictionnaire (même avec morphologie), c'est une erreur
    if (!estMotValideAvecMorphologie(token, dicoSet)) {
      const suggestion = trouverSuggestion(token);
      erreurs.push({ wrong: token, suggestion });
    }
  }
  return erreurs;
}

// ==================== Popup ====================

/**
 * Sécurise l'affichage HTML pour éviter les caractères spéciaux
 * @param {string} str
 * @returns {string}
 */
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

/**
 * Affiche une popup d'erreur avec les mots mal orthographiés et leurs suggestions
 * @param {HTMLElement} element
 * @param {Array<{wrong: string, suggestion: string|null}>} erreurs
 */
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

/**
 * Supprime la popup d'erreur si elle existe
 * @param {HTMLElement} element
 */
function supprimerPopupErreur(element) {
  if (element._arckchuallyPopup) {
    element._arckchuallyPopup.remove();
    delete element._arckchuallyPopup;
  }
}

// ==================== Initialisation ====================

const DELAI_DEBOUNCE = 600;
let timerDebounce = null;

/**
 * Initialisation principale : on charge le dictionnaire, puis on écoute les événements
 */
chargerDictionnaire().then(() => {
  // Quand le dictionnaire est prêt, on ajoute des écouteurs
  document.addEventListener("input", (e) => {
    const element = e.target;
    // On ne s'intéresse qu'aux INPUT, TEXTAREA et éléments contentEditable
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

  // Quand on quitte un champ (blur), on supprime la popup
  document.addEventListener("blur", (e) => {
    supprimerPopupErreur(e.target);
  }, true);
});
