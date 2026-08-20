# Split Bill OCR

Upload a receipt photo, review the auto-detected items/tax/service/total, add people,
assign items, save, and share a link that shows everyone what they owe.

## Setup

```bash
npm install
cp .env.example .env   # fill in the values below
npx prisma migrate dev --name init
npm run dev
```

Required env vars (`.env`):

- `DATABASE_URL` — Postgres connection string (Vercel Postgres / Neon free tier works).
- `BLOB_READ_WRITE_TOKEN` — from a Vercel Blob store (Storage tab in the Vercel dashboard).
- `GOOGLE_VISION_API_KEY` — a Google Cloud API key with the Vision API enabled (free tier: 1000 requests/month).

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel.
2. Add a Postgres database and a Blob store from the Vercel Storage tab — this sets
   `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` automatically.
3. Add `GOOGLE_VISION_API_KEY` as an environment variable.
4. Run `npx prisma migrate deploy` against the production `DATABASE_URL` (or add it as a
   build step) before first use.

## Notes

- Receipt parsing (`src/lib/receiptParser.ts`) is a line-by-line regex heuristic, not a
  real receipt grammar — it works for simple "name ... price" layouts. The review step
  lets users fix anything it gets wrong.
- Tax and service are split proportionally to each person's item subtotal.
