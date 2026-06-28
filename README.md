# Radarpolska

Private/admin-first data gathering foundation for Polish public-entity source coverage.

## Stack

- pnpm workspace managed by Turborepo
- Cloudflare Worker backend with Hono and tRPC
- React/Vite admin dashboard with React Query and tRPC client
- Drizzle schema targeting PostgreSQL through local Docker Compose or production Hyperdrive
- Vitest backend tests
- oxlint and oxfmt for code quality

## Development

```bash
pnpm install
pnpm dev
```

Run local Postgres when database-backed work begins:

```bash
docker compose up -d postgres
```

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
