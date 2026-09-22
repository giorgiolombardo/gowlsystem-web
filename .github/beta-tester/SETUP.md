# Beta Tester → GitHub Issue (gowlsystem-web / gowlsystem.com)

Repo ufficiale del sito: **giorgiolombardo/gowlsystem-web** (GitHub Pages → `gowlsystem.com`).

Flusso nativo (nessun servizio terzi):

```
Browser (form su gowlsystem.com)
  → apre Issue form GitHub (.github/ISSUE_TEMPLATE/beta_tester.yml)
  → l’utente conferma e crea l’Issue (label beta-tester, viewer)
```

Opzionale: Action `workflow_dispatch` / `repository_dispatch` per test manuali o automazioni interne (senza secret nel frontend).

## File

| File | Ruolo |
|------|--------|
| `index.html` | Sezione `#beta-access` |
| `beta-form.js` | Prefill Issue form + stati UI |
| `style.css` | Stili Beta |
| `.github/workflows/beta-tester-issue.yml` | Crea Issue da dispatch (test / automazione) |
| `.github/ISSUE_TEMPLATE/beta_tester.yml` | Form Issue nativo |

## Setup (Cursor)

### A. Apri il repo giusto

1. **File → Open Folder…**
2. Apri la cartella clonata di `gowlsystem-web` (non `gowlsys`).
3. Se non l’hai ancora:

```bash
cd ~
git clone https://github.com/giorgiolombardo/gowlsystem-web.git
```

Poi in Cursor: Open Folder → `~/gowlsystem-web`.

### B. Nessuna configurazione esterna

Il form punta a:

`https://github.com/giorgiolombardo/gowlsystem-web/issues/new?template=beta_tester.yml`

con i campi `email`, `professione`, `motivazione`, `aspettative` precompilati dal sito.

### C. Test Action (opzionale)

Actions → **Beta Tester → GitHub Issue** → Run workflow (input manuali), oppure `repository_dispatch` con `event_type: beta-tester-request` e `client_payload` (email, professione, …).

### D. Verifica

1. Apri `https://gowlsystem.com/#beta-access`
2. Compila e conferma l’Issue su GitHub
3. Controlla Issues con label `beta-tester`

## Privacy

Se il repo è pubblico, le Issue (con email) sono pubbliche. Alternative: repo Issues privato dedicato, oppure rimuovere l’email dal template e chiedere contatto via messaggio privato.
