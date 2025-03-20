(function() {
    /**************************************************************
     * PARAMÈTRES ET DICTIONNAIRE
     **************************************************************/
    const DICTIONARY_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/fr/fr_50k.txt";
    const DEBOUNCE_DELAY = 600;
  
    // Contiendront le dictionnaire complet { word, freq } et un Set
    let dictionary = [];
    let dictionarySet = null;
    let isDictionaryLoaded = false;
  
    // Chargement asynchrone du dictionnaire
    fetch(DICTIONARY_URL)
      .then(res => res.text())
      .then(text => {
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
        isDictionaryLoaded = true;
        console.log("[ArckchuallyCorrector] Dictionnaire chargé:", dictionary.length, "mots.");
      })
      .catch(err => {
        console.error("[ArckchuallyCorrector] Erreur chargement dictionnaire:", err);
      });
  
    /**************************************************************
     * FONCTIONS DE NETTOYAGE & VÉRIFICATION
     **************************************************************/
    function cleanWord(w) {
      return w
        .replace(/[.,!?;:"()«»']/g, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    }
  
    // Vérifie si la chaîne est purement numérique
    function isNumeric(str) {
      return /^[0-9]+$/.test(str);
    }
  
    /**
     * Renvoie différentes formes pour gérer la morphologie de base.
     * Ici, on traite notamment quelques suffixes fréquents.
     * - s, es : pluriels simples
     * - ent : terminaison verbale courante au présent
     * - iez : terminaison verbale (2e pers. du pluriel)
     * On peut en ajouter si on veut plus de couverture.
     */
    function getMorphologicalBases(cw) {
      const bases = [cw];
  
      // Enlève "s" (pluriel)
      if (cw.endsWith("s") && cw.length > 2) {
        bases.push(cw.slice(0, -1));
      }
      // Enlève "es" (pluriel)
      if (cw.endsWith("es") && cw.length > 3) {
        bases.push(cw.slice(0, -2));
      }
      // Enlève "ent" (verbes au présent ou adjectif pluriel)
      if (cw.endsWith("ent") && cw.length > 3) {
        bases.push(cw.slice(0, -3));
      }
      // Enlève "iez" (ex. "finissiez")
      if (cw.endsWith("iez") && cw.length > 3) {
        bases.push(cw.slice(0, -3));
      }
  
      // Éviter les doublons
      return Array.from(new Set(bases));
    }
  
    // Vérifie si un mot peut être valide (dictionarySet + morpho basique)
    function isWordValidWithMorphology(raw) {
      if (!dictionarySet || !isDictionaryLoaded) return true;
      const c = cleanWord(raw);
      if (!c) return true;
      // Directement valide ?
      if (dictionarySet.has(c)) return true;
      // Bases morphologiques
      const bases = getMorphologicalBases(c);
      for (const b of bases) {
        if (dictionarySet.has(b)) {
          return true;
        }
      }
      return false;
    }
  
    /**************************************************************
     * DISTANCE D'ÉDITION (LEVENSHTEIN) & SUGGESTION
     **************************************************************/
    function levenshtein(a, b) {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => []);
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (a[i - 1] === b[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1];
          } else {
            dp[i][j] = 1 + Math.min(
              dp[i - 1][j],
              dp[i][j - 1],
              dp[i - 1][j - 1]
            );
          }
        }
      }
      return dp[m][n];
    }
  
    // On ne propose qu'une seule suggestion (le "meilleur match")
    const suggestionCache = {};
  
    function findSingleSuggestion(raw) {
      if (!isDictionaryLoaded) return null;
      const cw = cleanWord(raw);
      if (!cw) return null;
      // Si déjà valide, pas de suggestion
      if (isWordValidWithMorphology(raw)) return null;
      // Cache
      if (suggestionCache[cw]) return suggestionCache[cw];
  
      // On compare aux mots de longueur ±2
      const length = cw.length;
      const candidates = dictionary.filter(item => {
        const dlen = item.word.length;
        return dlen >= (length - 2) && dlen <= (length + 2);
      });
  
      // Calcul distance + bonus de fréquence
      let best = null;
      let bestScore = Infinity;
      for (const item of candidates) {
        const dist = levenshtein(cw, item.word);
        // On favorise les mots plus fréquents
        const freqBonus = Math.log10(item.freq + 1) || 0;
        // Score final
        const score = dist - (freqBonus * 0.5);
        if (score < bestScore) {
          bestScore = score;
          best = item.word;
          // Petit early-exit si distance vraiment faible (ex. 1)
          if (dist <= 1) break;
        }
      }
      suggestionCache[cw] = best;
      return best;
    }
  
    /**************************************************************
     * ANALYSE DU TEXTE : CHERCHE LES FAUTES
     **************************************************************/
    function checkText(text) {
      if (!isDictionaryLoaded || !dictionarySet) return [];
      const tokens = text.split(/\s+/);
      const errs = [];
      for (const tk of tokens) {
        const c = cleanWord(tk);
        if (!c) continue;
        if (isNumeric(c)) continue;
        if (!isWordValidWithMorphology(tk)) {
          const suggestion = findSingleSuggestion(tk);
          errs.push({ wrong: tk, suggestion });
        }
      }
      return errs;
    }
  
    /**************************************************************
     * POPUP (PAS DE CLIC POUR CORRIGER)
     **************************************************************/
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
  
    // Affiche un popup indiquant la faute et la suggestion,
    // mais SANS possibilité de cliquer pour corriger.
    function showErrorPopup(element, errors) {
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
  
        // Barre en haut + Croix rouge pour fermer
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
          const tgt = ev.target;
          // Clique sur la croix => ferme la popup
          if (tgt.dataset.action === "close-popup") {
            removeErrorPopup(element);
            return;
          }
          // Sinon, ne fait rien (pas de correction au clic)
        });
  
        document.body.appendChild(popup);
        element._arckchuallyPopup = popup;
      }
  
      const msgDiv = popup.querySelector("[data-role='message']");
      if (!msgDiv) return;
  
      const lines = [];
      lines.push("☝️🤓 Erm, arckchually…");
      for (const e of errors) {
        if (!e.suggestion) {
          // Pas de suggestion => mot inconnu
          lines.push(`  - le mot « ${escapeHtml(e.wrong)} » n'existe pas ou n'est pas reconnu.`);
        } else {
          // Affiche la suggestion, mais sans lien cliquable
          lines.push(`  - c’est « ${escapeHtml(e.suggestion)} », pas « ${escapeHtml(e.wrong)} ».`);
        }
      }
      msgDiv.innerHTML = lines.join("<br/>");
  
      // Position
      const rect = element.getBoundingClientRect();
      popup.style.top = (rect.bottom + 5) + "px";
      popup.style.left = rect.left + "px";
    }
  
    function removeErrorPopup(element) {
      if (element._arckchuallyPopup) {
        element._arckchuallyPopup.remove();
        delete element._arckchuallyPopup;
      }
    }
  
    /**************************************************************
     * ÉCOUTE DES ÉVÉNEMENTS (INPUT, BLUR)
     **************************************************************/
    let debounceTimer = null;
  
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      ) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const text = (el.value !== undefined) ? el.value : el.innerText;
          const foundErrors = checkText(text);
          if (foundErrors.length > 0) {
            showErrorPopup(el, foundErrors);
          } else {
            removeErrorPopup(el);
          }
        }, DEBOUNCE_DELAY);
      }
    }, true);
  
    document.addEventListener("blur", (e) => {
      removeErrorPopup(e.target);
    }, true);
  })();
  