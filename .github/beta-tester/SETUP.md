# Beta Tester → GitHub Issue (gowlsystem-web / gowlsystem.com)

Repo ufficiale del sito: **giorgiolombardo/gowlsystem-web** (GitHub Pages → `gowlsystem.com`).

Flusso sicuro:

```
Browser (form)
  → Formspree (nessun secret in pagina)
  → Webhook Make.com / n8n
  → repository_dispatch (event: beta-tester-request)
  → Action crea Issue con label beta-tester, viewer
```

## File

| File | Ruolo |
|------|--------|
| `index.html` | Sezione `#beta-access` |
| `beta-form.js` | AJAX + stati UI |
| `style.css` | Stili Beta |
| `.github/workflows/beta-tester-issue.yml` | Crea Issue |
| `.github/ISSUE_TEMPLATE/beta_tester.yml` | Issue manuale |
| `.github/beta-tester/webhook-payload.example.json` | Body webhook |

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

### B. Formspree

1. Crea form su [formspree.io](https://formspree.io).
2. Copia `https://formspree.io/f/xxxxxx`.
3. In `index.html` sostituisci `YOUR_FORM_ID` nell’`action` di `#beta-form`.
4. Abilita il dominio `gowlsystem.com` nel pannello Formspree.

### C. PAT fine-grained

GitHub → Settings → Developer settings → Fine-grained token:

- Repository: **solo** `gowlsystem-web`
- Permission: **Issues → Read and write**

### D. Webhook → Issue

Make.com (gratis) o Formspree Webhooks:

- URL: `https://api.github.com/repos/giorgiolombardo/gowlsystem-web/dispatches`
- Method: `POST`
- Headers:
  - `Authorization: Bearer <PAT>`
  - `Accept: application/vnd.github+json`
- Body: vedi `webhook-payload.example.json` (`event_type`: `beta-tester-request`)

### E. Commit e push (da Cursor)

1. Source Control → stage di `index.html`, `style.css`, `beta-form.js`, `.github/**`
2. Commit: `Add Beta Tester access form and GitHub Issue workflow`
3. Push su `main` → GitHub Pages aggiorna `gowlsystem.com` in 1–2 minuti

### F. Verifica

1. Apri `https://gowlsystem.com/#beta-access`
2. Oppure Actions → **Beta Tester → GitHub Issue** → Run workflow (test manuale)
3. Controlla Issues con label `beta-tester`

## Privacy

Se il repo è pubblico, le Issue (con email) sono pubbliche. Alternative: repo Issues privato dedicato, oppure lasciare solo Formspree email e non creare Issue pubbliche.
