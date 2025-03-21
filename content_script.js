/******************************************************
 *   Arckchually Corrector - Version BK-Tree Optimisée
 *   (Tout-en-un, Manifest V3, sans import/export)
 ******************************************************/

/******************************************************
 *                      CONFIG
 ******************************************************/
const DICTIONNAIRE_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/fr/fr_50k.txt";
const DELAI_DEBOUNCE = 600;
const DISTANCE_MAX = 2;  // distance de Levenshtein max pour la suggestion

/******************************************************
 *         GESTION DU DICTIONNAIRE ET BK-TREE
 ******************************************************/
// Notre BK-Tree
let bkTree = null;

// Variables globales
let dictionnaireSet = null;
let dictionnaireCharge = false;

// Cache des suggestions pour éviter de rechercher 2 fois le même mot
let suggestionsCache = Object.create(null);

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

/******************************************************
 *                BK-TREE IMPLEMENTATION
 ******************************************************/

/**
 * Structure d'un nœud de BK-Tree :
 * {
 *   word: string,
 *   children: { [dist: number]: BKTreeNode } // mapping distance->enfant
 * }
 */

/**
 * Crée un nouveau nœud BK-Tree
 * @param {string} mot
 * @returns {object} BKTreeNode
 */
function creerNoeudBK(mot) {
  return {
    word: mot,
    children: {}
  };
}

/**
 * Insère un mot dans la BK-Tree
 * @param {object} node - racine ou sous-racine
 * @param {string} mot
 */
function insererBK(node, mot) {
  const dist = distanceLevenshtein(mot, node.word);
  // S'il existe déjà un enfant à cette distance, on descend
  if (node.children[dist]) {
    insererBK(node.children[dist], mot);
  } else {
    // Sinon, on crée un nouveau nœud enfant
    node.children[dist] = creerNoeudBK(mot);
  }
}

/**
 * Construit la BK-Tree à partir d'un tableau de mots
 * @param {string[]} mots
 * @returns {object|null} Racine de la BK-Tree
 */
function construireBKTree(mots) {
  if (!mots || mots.length === 0) return null;
  // On prend le premier mot comme racine
  const racine = creerNoeudBK(mots[0]);
  // On insère tous les autres
  for (let i = 1; i < mots.length; i++) {
    insererBK(racine, mots[i]);
  }
  return racine;
}

/**
 * Recherche dans la BK-Tree tous les mots à distance <= threshold
 * @param {object} node - nœud courant
 * @param {string} mot
 * @param {number} threshold
 * @param {string[]} result - accumulation des résultats
 */
function rechercherBK(node, mot, threshold, result) {
  if (!node) return;
  const distCourante = distanceLevenshtein(mot, node.word);

  // Si la distance est dans la limite, on ajoute le mot
  if (distCourante <= threshold) {
    result.push(node.word);
  }

  // On ne descend que dans la fourchette [distCourante - threshold, distCourante + threshold]
  const minRange = distCourante - threshold;
  const maxRange = distCourante + threshold;

  for (const distEnfantStr of Object.keys(node.children)) {
    const distEnfant = parseInt(distEnfantStr, 10);
    if (distEnfant >= minRange && distEnfant <= maxRange) {
      rechercherBK(node.children[distEnfant], mot, threshold, result);
    }
  }
}

/******************************************************
 *       CHARGER LE DICTIONNAIRE ET CONSTRUIRE LA BK-TREE
 ******************************************************/

/**
 * Nettoie un mot : retire ponctuation (sauf apostrophes), normalise, toLowerCase
 * @param {string} w
 * @returns {string}
 */
function cleanWord(w) {
  return w
    .replace(/[.,!?;:"()«»]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Charge le dictionnaire depuis l'URL, construit le Set et la BK-Tree
 */
function chargerDictionnaire() {
  return fetch(DICTIONNAIRE_URL)
    .then((res) => res.text())
    .then((texte) => {
      const lignes = texte.split(/\r?\n/);
      // On stocke les mots nettoyés
      const motsNettoyes = [];
      for (const ligne of lignes) {
        if (!ligne.trim()) continue;
        const [motBrut] = ligne.split(/\s+/);
        if (!motBrut) continue;
        const motLower = motBrut.toLowerCase();
        motsNettoyes.push(motLower);
      }

      // Construire le Set pour les vérifications directes
      dictionnaireSet = new Set(motsNettoyes);

      // Construire la BK-Tree
      console.time("Construction BK-Tree");
      bkTree = construireBKTree(motsNettoyes);
      console.timeEnd("Construction BK-Tree");

      dictionnaireCharge = true;
      console.log("[ArckchuallyCorrector] Dictionnaire chargé :", motsNettoyes.length, "mots.");
    })
    .catch((err) => {
      console.error("[ArckchuallyCorrector] Erreur lors du chargement du dictionnaire :", err);
    });
}

/******************************************************
 *         GESTION DES CONTRACTIONS (APOSTROPHES)
 ******************************************************/

/**
 * Enlève la contraction au début du mot (l', j', t', s', qu', etc.)
 * @param {string} word
 * @returns {string}
 */
function removeLeadingApostrophe(word) {
  // On tolère l’apostrophe ASCII ' ou typographique ’
  const match = word.match(/^(l|j|t|s|qu|c|n|m|d)(?:'|’)(.*)$/i);
  if (match) {
    return match[2];
  }
  return word;
}

/******************************************************
 *         MORPHOLOGIE (PLURIELS, CONJUGAISONS...)
 ******************************************************/

/**
 * Renvoie les bases morphologiques d'un mot (pluriel, etc.)
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
 * Vérifie si un mot est valide (dictionnaireSet) en tenant compte des bases morphologiques + contractions
 * @param {string} motOriginal
 * @param {Set<string>} dicoSet
 * @returns {boolean}
 */
function estMotValideAvecMorphologie(motOriginal, dicoSet) {
  const motNettoye = cleanWord(motOriginal);

  // 1) Test direct
  if (dicoSet.has(motNettoye)) return true;
  const bases = getMorphologicalBases(motNettoye);
  for (const base of bases) {
    if (dicoSet.has(base)) return true;
  }

  // 2) Test sans la contraction (ex: j'aimerais -> aimerais)
  const motSansContr = removeLeadingApostrophe(motNettoye);
  if (motSansContr !== motNettoye) {
    if (dicoSet.has(motSansContr)) return true;
    const basesContr = getMorphologicalBases(motSansContr);
    for (const base of basesContr) {
      if (dicoSet.has(base)) return true;
    }
  }

  return false;
}

/******************************************************
 *         RECHERCHE DE SUGGESTION VIA LA BK-TREE
 ******************************************************/

/**
 * Trouve la meilleure suggestion (distance ≤ DISTANCE_MAX) pour un mot
 * @param {string} motOriginal
 * @returns {string|null}
 */
function trouverSuggestion(motOriginal) {
  const motNettoye = cleanWord(motOriginal);
  if (!bkTree || !dictionnaireSet) return null;

  // Vérifier dans le cache
  if (suggestionsCache[motNettoye] !== undefined) {
    return suggestionsCache[motNettoye];
  }

  // On cherche tous les mots de la BK-Tree à distance ≤ DISTANCE_MAX
  const resultats = [];
  rechercherBK(bkTree, motNettoye, DISTANCE_MAX, resultats);

  if (resultats.length === 0) {
    suggestionsCache[motNettoye] = null;
    return null;
  }

  // On peut choisir le mot le plus proche ou, en cas d'égalité,
  // le plus fréquent. Ici, on se contente de prendre le 1er du tableau.
  // On peut améliorer en classant par distance, ou en triant autrement.
  let meilleurMot = null;
  let meilleureDistance = Infinity;

  for (const candidat of resultats) {
    const dist = distanceLevenshtein(motNettoye, candidat);
    if (dist < meilleureDistance) {
      meilleureDistance = dist;
      meilleurMot = candidat;
      if (dist === 0) break; // distance parfaite, on arrête
    }
  }

  // Stocker dans le cache
  if (meilleurMot && meilleureDistance <= DISTANCE_MAX) {
    suggestionsCache[motNettoye] = meilleurMot;
    return meilleurMot;
  } else {
    suggestionsCache[motNettoye] = null;
    return null;
  }
}

/******************************************************
 *            VERIFICATION DU TEXTE
 ******************************************************/

/**
 * Découpe le texte en mots et détecte les erreurs
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
    // Si le mot n'est pas reconnu, on propose une suggestion
    if (!estMotValideAvecMorphologie(token, dicoSet)) {
      const suggestion = trouverSuggestion(token);
      erreurs.push({ wrong: token, suggestion });
    }
  }
  return erreurs;
}

/******************************************************
 *                   POPUP
 ******************************************************/

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

/******************************************************
 *             INITIALISATION GLOBALE
 ******************************************************/

let timerDebounce = null;

chargerDictionnaire().then(() => {
  // Écouteur principal pour la saisie
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

  // Écouteur pour enlever la popup au blur
  document.addEventListener("blur", (e) => {
    supprimerPopupErreur(e.target);
  }, true);
});
