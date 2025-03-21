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
  
  export { afficherPopupErreur, supprimerPopupErreur };
  