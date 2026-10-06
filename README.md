# Horaires App

SaaS multi-entreprises de gestion des horaires et pointage. Voir `CLAUDE.md`
pour le contexte complet du projet, les décisions d'architecture et l'état
d'avancement — c'est le fichier à lire en premier (Claude Code le lit
automatiquement).

## Prérequis

- Node.js ≥ 20
- pnpm (`npm install -g pnpm`)
- Docker (pour Postgres local)

## Setup — première installation

```bash
# 1. Installer toutes les dépendances (backend + 3 apps front + packages)
pnpm install

# 2. Lancer Postgres + Adminer en local
docker compose up -d

# 3. Configurer les variables d'environnement du backend
cp apps/backend/.env.example apps/backend/.env
# éditer apps/backend/.env si besoin (les valeurs par défaut marchent avec le docker-compose fourni)

# 4. Appliquer le schéma à la base
cd apps/backend
npx prisma migrate dev --name init
cd ../..

# 5. Lancer tout en parallèle (backend + apps front)
pnpm dev
```

Le backend tourne sur `http://localhost:3000`, la doc API sur
`http://localhost:3000/api-docs`, Adminer (visualisation DB) sur
`http://localhost:8080`.

## Structure

```
horaires-app/
├── CLAUDE.md              ← contexte projet, À LIRE EN PREMIER
├── apps/
│   ├── backend/            NestJS + Prisma + PostgreSQL
│   ├── checkin-mobile/     App mobile staff + managers (Expo)
│   ├── checkin-pos/        App tablette kiosk pour le pointage (Expo)
│   └── web-manager/        App web managers, création des horaires (Vite + React)
├── packages/
│   ├── shared-types/       Types TS partagés
│   ├── api-client/         Client HTTP typé partagé
│   └── ui-tokens/          Couleurs, espacements, typo partagés
└── docker-compose.yml       Postgres + Adminer pour le dev local
```

## Commandes utiles

```bash
pnpm dev              # lance backend + toutes les apps front en parallèle (turbo)
pnpm build            # build tout
pnpm --filter @horaires/backend prisma:migrate   # nouvelle migration DB
pnpm --filter @horaires/checkin-mobile dev        # lancer uniquement l'app mobile staff/manager
pnpm --filter @horaires/checkin-pos dev           # lancer uniquement l'app tablette
pnpm --filter @horaires/web-manager dev           # lancer uniquement le web manager
```

## État du projet

Voir la section "État actuel du repo" dans `CLAUDE.md` pour le détail de ce
qui est fait vs à faire, et l'ordre recommandé pour la suite.
