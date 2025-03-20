import { loadDictionary, getDictionarySet } from './dictionary.js';
import { showErrorPopup, removeErrorPopup } from './popup.js';
import { checkText } from './textCheck.js';

const DEBOUNCE_DELAY = 600;
let debounceTimer = null;

// Charger le dictionnaire et ajouter des écouteurs d'événements
loadDictionary().then(() => {
  document.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      ) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const text = el.value !== undefined ? el.value : el.innerText;
          const foundErrors = checkText(text, getDictionarySet());
          if (foundErrors.length > 0) {
            showErrorPopup(el, foundErrors);
          } else {
            removeErrorPopup(el);
          }
        }, DEBOUNCE_DELAY);
      }
    },
    true
  );

  document.addEventListener(
    "blur",
    (e) => {
      removeErrorPopup(e.target);
    },
    true
  );
});
