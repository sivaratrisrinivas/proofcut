# Bun dev-loop + Vercel + static JSON for prototype

Prototype uses Bun for install/test/build + TS/Next.js deployed to Vercel, with product specs as static JSON and no Postgres/auth, to reach a public demo link by D7. Full Bun server and Go/Postgres/GCP alignment with the posting become the production-path slide, not the prototype.

## Considered Options

- Full Bun server (`Bun.serve` + Hono/Elysia) on Cloud Run — prod Bun, slower demo link.
- Go/TS/GraphQL/Postgres/GCP per posting — closer to hiring stack, too heavy for 3-7 day solo.

## Consequences

- Vercel prod runs Node, not Bun runtime; Bun capabilities used in dev loop (`bun install/test/build`, `bunx`, `BunFile` I/O). Revisit deploy target before any production claim.
