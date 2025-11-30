/******************************************************
 * Arckchually Corrector - Version 4.0 "Pro"
 * (Tout-en-un : Cache, Dico Perso, Rich Text)
 ******************************************************/

/******************************************************
 * CONFIG
 ******************************************************/
const DICTIONNAIRE_URL = chrome.runtime.getURL("fr_50k.txt");
const DELAI_DEBOUNCE = 600;
const DISTANCE_MAX = 2;

/******************************************************
 * ÉTAT GLOBAL ET CACHE
 ******************************************************/
let bkTree = null;
let dictionnaireSet = null; // Mots valides (incluant dico perso)
let dicoPersoSet = new Set(); // Mots ignorés par l'utilisateur
let dictionnaireCharge = false;
let suggestionsCache = Object.create(null);
let timerDebounce = null;

/******************************************************
 * UTILITAIRES TEXTE & LEVENSHTEIN
 ******************************************************/

function cleanWord(w) {
  return w
    .replace(/[.,!?;:"()«»]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Enlève les accents pour la comparaison
    .toLowerCase();
}

function distanceLevenshtein(a, b) {
  const matrice = [];
  for (let i = 0; i <= b.length; i++) matrice[i] = [i];
  for (let j = 0; j <= a.length; j++) matrice[0][j] = j;
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

/******************************************************
 * BK-TREE (Structure)
 ******************************************************/
function creerNoeudBK(mot) {
  return { word: mot, children: {} };
}

function insererBK(node, mot) {
  const dist = distanceLevenshtein(mot, node.word);
  if (node.children[dist]) {
    insererBK(node.children[dist], mot);
  } else {
    node.children[dist] = creerNoeudBK(mot);
  }
}

function construireBKTree(mots) {
  if (!mots || mots.length === 0) return null;
  const racine = creerNoeudBK(mots[0]);
  for (let i = 1; i < mots.length; i++) {
    insererBK(racine, mots[i]);
  }
  return racine;
}

function rechercherBK(node, mot, threshold, result) {
  if (!node) return;
  const distCourante = distanceLevenshtein(mot, node.word);
  if (distCourante <= threshold) result.push(node.word);

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
 * CHARGEMENT (Optimisé avec Cache Storage)
 ******************************************************/

async function initialiserTout() {
  console.time("Init Arckchually");

  // 1. Charger le dictionnaire personnel
  await chargerDicoPerso();

  // 2. Vérifier si on a une version pré-traitée des mots en cache
  // On ne stocke pas l'arbre (trop complexe à sérialiser), mais la liste propre.
  // Cela économise le fetch et le regex cleaning.
  const cacheKey = "arckchually_words_cache_v2";

  chrome.storage.local.get([cacheKey], async (result) => {
    let motsNettoyes = result[cacheKey];

    if (
      motsNettoyes &&
      Array.isArray(motsNettoyes) &&
      motsNettoyes.length > 1000
    ) {
      console.log("[Arckchually] Chargement depuis le cache local...");
    } else {
      console.log(
        "[Arckchually] Cache vide, téléchargement du dictionnaire..."
      );
      try {
        const response = await fetch(DICTIONNAIRE_URL);
        const texte = await response.text();
        motsNettoyes = [];
        const lignes = texte.split(/\r?\n/);
        for (const ligne of lignes) {
          if (!ligne.trim()) continue;
          const [motBrut] = ligne.split(/\s+/);
          if (motBrut) motsNettoyes.push(cleanWord(motBrut));
        }
        // Sauvegarder dans le cache pour la prochaine fois
        chrome.storage.local.set({ [cacheKey]: motsNettoyes });
      } catch (e) {
        console.error("Erreur chargement dictionnaire", e);
        return;
      }
    }

    // Reconstruction de l'arbre et du Set (Rapide en JS pur)
    dictionnaireSet = new Set(motsNettoyes);
    bkTree = construireBKTree(motsNettoyes);
    dictionnaireCharge = true;
    console.timeEnd("Init Arckchually");
  });
}

// Gestion du Dico Perso
function chargerDicoPerso() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["arckchually_personal_dict"], (res) => {
      const saved = res.arckchually_personal_dict || [];
      dicoPersoSet = new Set(saved);
      resolve();
    });
  });
}

function ajouterAuDicoPerso(mot) {
  const motClean = cleanWord(mot);
  dicoPersoSet.add(motClean);
  // Persistance
  chrome.storage.local.set({
    arckchually_personal_dict: Array.from(dicoPersoSet),
  });
  console.log(`[Arckchually] Mot ajouté au dico perso : ${mot}`);
}

/******************************************************
 * MORPHOLOGIE & VALIDATION AVANCÉE
 ******************************************************/

function removeLeadingApostrophe(word) {
  const match = word.match(/^(l|j|t|s|qu|c|n|m|d)(?:'|’)(.*)$/i);
  return match ? match[2] : word;
}

// Amélioration de la conjugaison (heuristique)
function getMorphologicalBases(cw) {
  const bases = new Set([cw]);
  const len = cw.length;

  // Pluriels simples
  if (cw.endsWith("s") && len > 3) bases.add(cw.slice(0, -1));
  if (cw.endsWith("x") && len > 3) bases.add(cw.slice(0, -1));

  // Conjugaisons 1er groupe & standards
  if (cw.endsWith("es") && len > 3) bases.add(cw.slice(0, -2));
  if (cw.endsWith("nt") && len > 4) bases.add(cw.slice(0, -2)); // aiment -> aime
  if (cw.endsWith("ent") && len > 4) bases.add(cw.slice(0, -3)); // mangent -> mang
  if (cw.endsWith("ons") && len > 4) bases.add(cw.slice(0, -3)); // mangeons -> mange
  if (cw.endsWith("ez") && len > 3) bases.add(cw.slice(0, -2));
  if (cw.endsWith("ais") && len > 4) bases.add(cw.slice(0, -3)); // aimais -> aim
  if (cw.endsWith("ait") && len > 4) bases.add(cw.slice(0, -3));
  if (cw.endsWith("ient") && len > 5) bases.add(cw.slice(0, -4)); // aimaient -> aim

  // Féminin simple
  if (cw.endsWith("e") && len > 3) bases.add(cw.slice(0, -1));

  return Array.from(bases);
}

function estMotValide(motOriginal) {
  const motNettoye = cleanWord(motOriginal);
  if (!motNettoye || motNettoye.length < 2) return true; // Ignorer mots 1 lettre

  // 1. Vérif Dico Perso
  if (dicoPersoSet.has(motNettoye)) return true;

  // 2. Vérif Dico Global
  if (dictionnaireSet.has(motNettoye)) return true;

  // 3. Morphologie (Pluriel, etc)
  const bases = getMorphologicalBases(motNettoye);
  for (const base of bases) {
    if (dictionnaireSet.has(base)) return true;
  }

  // 4. Apostrophes
  const motSansContr = removeLeadingApostrophe(motNettoye);
  if (motSansContr !== motNettoye) {
    if (dictionnaireSet.has(motSansContr)) return true;
    if (dicoPersoSet.has(motSansContr)) return true;
    // Morphologie sur la partie sans apostrophe
    const basesContr = getMorphologicalBases(motSansContr);
    for (const base of basesContr) {
      if (dictionnaireSet.has(base)) return true;
    }
  }

  return false;
}

/******************************************************
 * RECHERCHE DE SUGGESTION
 ******************************************************/

function trouverSuggestion(motOriginal) {
  const motNettoye = cleanWord(motOriginal);
  if (!bkTree || !dictionnaireSet) return null;

  if (suggestionsCache[motNettoye] !== undefined) {
    return suggestionsCache[motNettoye];
  }

  const resultats = [];
  rechercherBK(bkTree, motNettoye, DISTANCE_MAX, resultats);

  if (resultats.length === 0) {
    suggestionsCache[motNettoye] = null;
    return null;
  }

  let meilleurMot = null;
  let meilleureDistance = Infinity;

  for (const candidat of resultats) {
    const dist = distanceLevenshtein(motNettoye, candidat);
    if (dist < meilleureDistance) {
      meilleureDistance = dist;
      meilleurMot = candidat;
    }
  }

  const res =
    meilleurMot && meilleureDistance <= DISTANCE_MAX ? meilleurMot : null;
  suggestionsCache[motNettoye] = res;
  return res;
}

/******************************************************
 * REMPLACEMENT INTELLIGENT (RICH TEXT)
 ******************************************************/

function corrigerDansElement(element, faute, correction) {
  // 1. Cas INPUT / TEXTAREA
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    const val = element.value;
    // Remplacement simple (toutes les occurrences pour l'instant)
    // Idéalement, on utiliserait selectionStart pour cibler le mot proche du curseur
    const regex = new RegExp(`\\b${faute}\\b`, "gi");
    // Attention : remplace toutes les occurrences du mot dans le champ
    const newText = val.replace(regex, correction);

    // Préservation curseur (approximative)
    const oldStart = element.selectionStart;
    element.value = newText;
    element.selectionStart = element.selectionEnd = oldStart;

    // Déclencher l'event 'input' pour que les sites (React/Vue) détectent le changement
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // 2. Cas CONTENTEDITABLE (Gmail, etc.)
  else if (element.isContentEditable) {
    // Méthode un peu "brute" mais universelle : on récupère le HTML
    // Attention : peut casser certains event listeners complexes, mais fonctionne pour du texte simple.
    // Une méthode plus propre nécessite l'API Selection/Range complexe.

    // Essai simple : Regex sur innerHTML (Risqué si le mot est une classe CSS, mais \b aide)
    // Pour limiter la casse, on ne touche qu'au texte visible.

    // Approche Focus : On essaie de remplacer là où est le focus ? Difficile depuis un clic popup.
    // Approche Globale Simple :
    const regex = new RegExp(`\\b${faute}\\b`, "gi");
    if (element.innerHTML.match(regex)) {
      // On utilise execCommand si possible (deprecated mais gère l'historique undo/redo)
      // Mais execCommand insertText marche à la position du curseur.
      // Ici on fait un replace global dans le HTML.
      element.innerHTML = element.innerHTML.replace(regex, correction);
      // Force update
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}

/******************************************************
 * INTERFACE UI
 ******************************************************/

function afficherPopupErreur(element, erreurs) {
  let popup = element._arckchuallyPopup;

  if (!popup) {
    popup = document.createElement("div");
    // Styles Modernes
    Object.assign(popup.style, {
      position: "fixed",
      backgroundColor: "#ffffff",
      border: "1px solid #e0e0e0",
      borderRadius: "12px",
      padding: "16px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
      zIndex: "2147483647", // Max Z-index
      fontFamily: "Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize: "14px",
      width: "300px",
      color: "#333",
      transition: "opacity 0.2s ease, transform 0.2s ease",
      opacity: "0",
      transform: "translateY(10px)",
    });

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
      borderBottom: "1px solid #f0f0f0",
      paddingBottom: "8px",
    });
    header.innerHTML = `<strong style="font-size:15px">☝️🤓 Arckchually...</strong>`;

    const closeBtn = document.createElement("span");
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
      cursor: "pointer",
      fontSize: "22px",
      color: "#999",
      lineHeight: "16px",
    });
    closeBtn.onclick = () => supprimerPopupErreur(element);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // Conteneur Liste
    const listDiv = document.createElement("div");
    listDiv.className = "arck-list";
    popup.appendChild(listDiv);

    document.body.appendChild(popup);
    element._arckchuallyPopup = popup;

    // Animation In
    requestAnimationFrame(() => {
      popup.style.opacity = "1";
      popup.style.transform = "translateY(0)";
    });
  }

  const listDiv = popup.querySelector(".arck-list");
  listDiv.innerHTML = "";

  const erreursAffichees = erreurs.slice(0, 4); // Max 4 items

  erreursAffichees.forEach((err) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "8px",
      padding: "8px",
      backgroundColor: "#f8f9fa",
      borderRadius: "6px",
    });

    // Colonne texte
    const textCol = document.createElement("div");
    if (err.suggestion) {
      textCol.innerHTML = `
        <div style="color:#d63031; text-decoration:line-through; font-size:12px">${err.wrong}</div>
        <div style="color:#00b894; font-weight:bold; cursor:pointer;" title="Cliquer pour corriger">👉 ${err.suggestion}</div>
      `;
      // Clic pour corriger
      textCol.onclick = () => {
        corrigerDansElement(element, err.wrong, err.suggestion);
        // Supprimer visuellement la ligne
        row.remove();
        if (listDiv.children.length === 0) supprimerPopupErreur(element);
      };
    } else {
      textCol.innerHTML = `<div style="color:#d63031; font-weight:bold">${err.wrong} ?</div>`;
    }

    // Bouton Ignorer (+)
    const ignoreBtn = document.createElement("button");
    ignoreBtn.textContent = "+";
    ignoreBtn.title = "Ajouter au dictionnaire personnel";
    Object.assign(ignoreBtn.style, {
      border: "none",
      background: "transparent",
      color: "#b2bec3",
      fontSize: "18px",
      cursor: "pointer",
      marginLeft: "10px",
    });
    ignoreBtn.onmouseover = () => (ignoreBtn.style.color = "#0984e3");
    ignoreBtn.onmouseout = () => (ignoreBtn.style.color = "#b2bec3");

    ignoreBtn.onclick = (e) => {
      e.stopPropagation();
      ajouterAuDicoPerso(err.wrong);
      row.style.opacity = "0.3"; // Feedback visuel
      setTimeout(() => row.remove(), 500);
    };

    row.appendChild(textCol);
    row.appendChild(ignoreBtn);
    listDiv.appendChild(row);
  });

  if (erreurs.length > 4) {
    const more = document.createElement("div");
    more.textContent = `+ ${erreurs.length - 4} autres...`;
    more.style.fontSize = "11px";
    more.style.color = "#aaa";
    more.style.textAlign = "center";
    listDiv.appendChild(more);
  }

  // Positionnement intelligent
  const rect = element.getBoundingClientRect();
  const topPos = rect.bottom + window.scrollY + 5;
  const leftPos = rect.left + window.scrollX;
  popup.style.top = topPos + "px";
  popup.style.left = leftPos + "px";
}

function supprimerPopupErreur(element) {
  if (element._arckchuallyPopup) {
    element._arckchuallyPopup.remove();
    delete element._arckchuallyPopup;
  }
}

/******************************************************
 * MOTEUR PRINCIPAL
 ******************************************************/

function traiterSaisie(element) {
  if (!dictionnaireCharge) return;

  // Récupération texte
  let texte = "";
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    texte = element.value;
  } else if (element.isContentEditable) {
    texte = element.innerText; // innerText respecte mieux les retours à la ligne que textContent
  }

  if (!texte || !texte.trim()) {
    supprimerPopupErreur(element);
    return;
  }

  // Analyse
  const tokens = texte.split(/\s+/);
  const erreurs = [];

  // Utiliser un Set pour éviter les doublons dans l'affichage
  const erreursVues = new Set();

  for (const token of tokens) {
    const motClean = cleanWord(token);
    if (!motClean || motClean.length < 2) continue;

    if (!estMotValide(token)) {
      if (!erreursVues.has(motClean)) {
        const suggestion = trouverSuggestion(token);
        erreurs.push({ wrong: token, suggestion });
        erreursVues.add(motClean);
      }
    }
  }

  if (erreurs.length > 0) {
    afficherPopupErreur(element, erreurs);
  } else {
    supprimerPopupErreur(element);
  }
}

/******************************************************
 * INITIALISATION
 ******************************************************/

initialiserTout().then(() => {
  document.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      ) {
        if (timerDebounce) clearTimeout(timerDebounce);
        timerDebounce = setTimeout(() => traiterSaisie(el), DELAI_DEBOUNCE);
      }
    },
    true
  );

  // Clic en dehors pour fermer
  document.addEventListener(
    "click",
    (e) => {
      // Si on clique quelque part qui n'est pas le popup ni l'input
      // On ferme les popups existants (simplification)
      // (L'idéal serait de gérer par élément actif)
    },
    true
  );

  document.addEventListener(
    "blur",
    (e) => {
      // Délai pour permettre le clic sur le bouton "Corriger" ou "+" du popup
      setTimeout(() => {
        const activeEl = document.activeElement;
        // Si le focus n'est pas passé dans le popup (difficile à détecter car popup est div)
        // On laisse l'utilisateur fermer avec la croix ou on attend une nouvelle saisie
        // Pour cette version UX : on laisse la popup visible un peu plus longtemps ou jusqu'à la croix
        // supprimerPopupErreur(e.target); <--- Désactivé pour permettre le clic sur les boutons
      }, 200);
    },
    true
  );
});
