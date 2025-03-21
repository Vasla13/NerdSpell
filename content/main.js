import { chargerDictionnaire, obtenirDictionnaireSet } from './dictionary.js';
import { afficherPopupErreur, supprimerPopupErreur } from './popup.js';
import { verifierTexte } from './textCheck.js';

const DELAI_DEBOUNCE = 600;
let timerDebounce = null;

// Charger le dictionnaire et ajouter les écouteurs d'événements
chargerDictionnaire().then(() => {
  document.addEventListener(
    "input",
    (e) => {
      const element = e.target;
      if (
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable
      ) {
        if (timerDebounce) clearTimeout(timerDebounce);
        timerDebounce = setTimeout(() => {
          const texte = element.value !== undefined ? element.value : element.innerText;
          const erreurs = verifierTexte(texte, obtenirDictionnaireSet());
          if (erreurs.length > 0) {
            afficherPopupErreur(element, erreurs);
          } else {
            supprimerPopupErreur(element);
          }
        }, DELAI_DEBOUNCE);
      }
    },
    true
  );

  document.addEventListener(
    "blur",
    (e) => {
      supprimerPopupErreur(e.target);
    },
    true
  );
});
