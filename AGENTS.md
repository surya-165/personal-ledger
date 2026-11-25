# Personal Ledger

Standalone copy of the app originally built in Lovable (repo `kanakku-vazhakku`).
This repo is NOT connected to Lovable: it runs on its own Supabase project and
deploys to Vercel. Never push to or change the original Lovable repo or database.

- Build target is Vercel, set by `nitro: { preset: "vercel" }` in `vite.config.ts`.
- Environment variables are listed in `.env.example`; real values live in Vercel.
- Database schema lives in `supabase/migrations/`.
