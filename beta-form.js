/**
 * gOWLsystem-web — form Beta Tester (gowlsystem.com)
 * Invio diretto a Formspree → conferma a schermo (nessun login GitHub).
 *
 * Configura l'endpoint in index.html (action del form) oppure in FORM_ENDPOINT sotto.
 */
(function () {
  "use strict";

  /** Fallback se l'attributo action del form non è valorizzato. */
  var FORM_ENDPOINT = "";

  var form = document.getElementById("beta-form");
  if (!form) return;

  var submitBtn = document.getElementById("beta-submit");
  var statusEl = document.getElementById("beta-status");
  if (!submitBtn || !statusEl) return;

  var label = submitBtn.querySelector(".btn-label");
  var loading = submitBtn.querySelector(".btn-loading");

  function setBusy(busy) {
    submitBtn.disabled = busy;
    if (label) label.hidden = busy;
    if (loading) loading.hidden = !busy;
  }

  function showStatus(ok, message) {
    statusEl.hidden = false;
    statusEl.className = "form-status " + (ok ? "ok" : "err");
    statusEl.textContent = message;
  }

  function endpoint() {
    var action = (form.getAttribute("action") || "").trim();
    if (action && action !== "#" && action.indexOf("YOUR_FORM_ID") === -1) {
      return action;
    }
    if (FORM_ENDPOINT && FORM_ENDPOINT.indexOf("YOUR_FORM_ID") === -1) {
      return FORM_ENDPOINT;
    }
    return "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var url = endpoint();
    if (!url) {
      showStatus(
        false,
        "Form non ancora configurato: inserisci l'URL Formspree in index.html (action del form)."
      );
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setBusy(true);
    statusEl.hidden = true;

    fetch(url, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json().catch(function () {
          return {};
        });
      })
      .then(function () {
        form.reset();
        showStatus(
          true,
          "Richiesta inviata. Ti contatteremo all'email indicata con le istruzioni di accesso."
        );
      })
      .catch(function () {
        showStatus(
          false,
          "Invio non riuscito. Riprova oppure scrivi a info@gowlsystem.com."
        );
      })
      .finally(function () {
        setBusy(false);
      });
  });
})();
