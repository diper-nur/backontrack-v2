# BackOnTrack v2 — Phase 1 starter

Static GitHub Pages website + Supabase Auth. **This is not the completed PHP migration.**

## Files
- `docs/` — the only folder that GitHub Pages publishes.
- `docs/index.html` — homepage migrated from original PHP template.
- `docs/login.html`, `docs/register.html`, `docs/dashboard.html` — Supabase email/password authentication starter.
- `docs/assets/js/config.js` — put your Supabase Project URL and **publishable** key here only after creating the project. Never put OpenAI or `sb_secret_` keys here.
- `docs/assets/css/original-style.css` — reference copy of original application CSS, not yet applied to dynamic pages.

## Preview locally
In VS Code install *Live Server* extension and choose 'Open with Live Server' on `docs/index.html`.

## GitHub Pages
Create a fresh public repository (do NOT copy the original `.git` folder). Push this scaffold, then go to Settings > Pages > Deploy from a branch > main > `/docs` > Save.

## Supabase
1. Create a Supabase project, select a secure DB password.
2. Copy Project URL and **Publishable key** from Connect / Settings > API Keys into `docs/assets/js/config.js`.
3. Authentication > URL Configuration: set Site URL to your Pages URL ending `/` and add Pages and local preview URLs as Redirect URLs.
4. Test email signup, confirmation email, login and sign-out.
5. Keep Email confirmation enabled for public launch. Supabase's default email delivery has restrictions; use an SMTP provider for production.

## Not implemented yet
SQL schema/RLS, class membership, tasks, uploading files, document extraction/OCR, AI API Edge Functions and AI cost limits. Do not mistake Phase 1 for a production-ready education service.
