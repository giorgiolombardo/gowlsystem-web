# Beta Tester — Formspree (nessuna GitHub Issue)

Flusso:

```
Form su gowlsystem.com
  → POST Formspree (AJAX)
  → conferma immediata a schermo
  → ricevi le richieste via email Formspree
```

Nessun login utente. Nessuna Issue automatica.

## Setup (2 minuti)

1. Crea un form su [formspree.io](https://formspree.io) (piano free ok).
2. Copia l’endpoint `https://formspree.io/f/xxxxxx`.
3. In `index.html`, nel form `#beta-form`, sostituisci `YOUR_FORM_ID` nell’attributo `action`.
4. In Formspree abilita il dominio `gowlsystem.com` (e `localhost` per test).
5. Commit + push su `main` → Pages aggiorna il sito.

## Campi inviati

| name | Obbligatorio |
|------|----------------|
| `email` | sì |
| `professione` | sì |
| `motivazione` | no |
| `aspettative` | no |
| `_subject` | fisso |
| `source` | `gowlsystem.com/#beta-access` |

Honeypot anti-bot: campo `_gotcha` (nascosto).

## Verifica

1. Apri https://gowlsystem.com/#beta-access
2. Invia una richiesta di prova
3. Controlla la casella collegata a Formspree e il messaggio verde a schermo

## Alternative

Stesso `beta-form.js` funziona con qualsiasi endpoint che accetti `multipart/form-data` o `FormData` e risponda JSON 2xx (es. Getform, Basin, Netlify Forms con adattamento minore).
