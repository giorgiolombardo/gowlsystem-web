/**
 * gOWLsystem-web — form Beta Tester (gowlsystem.com)
 * Invio → Formspree → webhook → repository_dispatch → GitHub Issue
 */
(function () {
  "use strict";

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

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var action = form.getAttribute("action") || "";
    if (action.indexOf("YOUR_FORM_ID") !== -1) {
      showStatus(
        false,
        "Configura Formspree: sostituisci YOUR_FORM_ID in index.html (vedi .github/beta-tester/SETUP.md)."
      );
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setBusy(true);
    statusEl.hidden = true;

    fetch(action, {
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
