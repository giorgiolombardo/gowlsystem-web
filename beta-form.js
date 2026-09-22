/**
 * gOWLsystem-web — form Beta Tester (gowlsystem.com)
 * Invio → apre il form Issue nativo GitHub (.github/ISSUE_TEMPLATE/beta_tester.yml)
 */
(function () {
  "use strict";

  var ISSUE_FORM_URL =
    "https://github.com/giorgiolombardo/gowlsystem-web/issues/new?template=beta_tester.yml";

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

  function fieldValue(name) {
    var el = form.elements.namedItem(name);
    if (!el) return "";
    return String(el.value || "").trim();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setBusy(true);
    statusEl.hidden = true;

    var params = new URLSearchParams();
    params.set("template", "beta_tester.yml");
    params.set("email", fieldValue("email"));
    params.set("professione", fieldValue("professione"));
    params.set("motivazione", fieldValue("motivazione"));
    params.set("aspettative", fieldValue("aspettative"));

    var url =
      "https://github.com/giorgiolombardo/gowlsystem-web/issues/new?" +
      params.toString();

    try {
      window.open(url, "_blank", "noopener,noreferrer");
      showStatus(
        true,
        "Si apre GitHub: conferma e invia l'Issue per completare la richiesta Beta."
      );
    } catch (err) {
      showStatus(
        false,
        "Impossibile aprire GitHub. Usa il link diretto oppure scrivi a info@gowlsystem.com."
      );
      window.location.href = ISSUE_FORM_URL;
    } finally {
      setBusy(false);
    }
  });
})();
