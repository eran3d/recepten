# Recepten

Statische receptenpagina's met [schema.org Recipe JSON-LD](https://schema.org/Recipe), zodat ze direct importeerbaar zijn in **Pestle** (en elke andere recepten-app die structured data parst).

Wordt gevuld door de Jarvis-skill `recepten` (zie `~/Developer/Eran/Jarvis/.claude/skills/recepten.md`): screenshot van een recept → Claude extraheert → HTML + JSON-LD + Imagen hero-foto → commit + push → Cloudflare deployt automatisch.

## Structuur

```
public/
├── index.html          # Overzichtspagina met alle recepten
├── style.css           # Gedeelde stylesheet
└── <slug>/
    ├── index.html      # Receptpagina (JSON-LD + nette weergave)
    └── hero.jpg        # Gegenereerde hero-foto (Imagen 4)
templates/
└── recept.html         # Template met {{PLACEHOLDERS}}
```

## Eenmalige Cloudflare setup

Zie ook `Jarvis/docs/cloudflare-workers-static-assets.md`.

1. Dashboard → Workers & Pages → **Create application** → tab **Pages** → **Import an existing Git repository** → kies `eran3d/recepten`
2. Build config:
   - Build command: `exit 0` (geen build nodig — pure static files)
   - Build output: `public`
   - Deploy command: `npx wrangler deploy` (NIET `wrangler pages deploy`)
3. Save and Deploy
4. Custom domain: project → Settings → **Domains & Routes** → Add → `recepten.jal.ink`

Daarna is elke `git push` naar `main` automatisch live.

## Pestle import

Open een recept-URL (bv. `https://recepten.jal.ink/shakshuka/`), deel naar Pestle of plak de URL in Pestle → Import. Pestle leest de JSON-LD.
