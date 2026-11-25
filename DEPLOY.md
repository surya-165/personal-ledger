# Moving off Lovable: database + Vercel

The original Lovable app and its database are left untouched. This repo gets
its own Supabase project and its own Vercel deployment.

## 1. Create your own Supabase project
supabase.com → New project. Note the project ref, the database password, and
from Project Settings → API: the URL, the publishable/anon key and the
service role key.

## 2. Export data from Lovable
In the Lovable project: Database → Export → Start export. When the email
arrives, download the `.backup` file from Storage. (Uploaded files in Storage
buckets are not included; download those separately.)

## 3. Restore into the new project
The export is a Postgres custom-format archive, restored with `pg_restore`
using the connection string from Supabase → Connect. A new Supabase project
already has its own `auth`, `storage` and other internal schemas, so restore
only your app tables (`public`) and user accounts (`auth.users`,
`auth.identities`), not the whole archive. List what's inside first:

    pg_restore -l export.backup

The exact restore commands depend on what that listing shows. Test on a
throwaway project first, then log in with your existing account to check
that users carried over.

## 4. Deploy on Vercel
vercel.com → Add New → Project → import `personal-ledger`. Framework preset:
Other (the build writes `.vercel/output` itself). Add every variable from
`.env.example` with your new project's values, then deploy.

## 5. Point Supabase auth at the new site
Supabase → Authentication → URL Configuration: set Site URL to your Vercel
URL and add it to Redirect URLs.
