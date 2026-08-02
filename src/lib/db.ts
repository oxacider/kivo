import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Build the Prisma datasource URL that is compatible with the Supabase
 * transaction pooler (PgBouncer, port 6543).
 *
 * Error 42P05 (`prepared statement "s0" already exists`) happens when Prisma's
 * persistent prepared statements are sent through a transaction-mode pooler.
 * Prisma disables the prepared-statement cache only when the connection string
 * carries `?pgbouncer=true`. The production DATABASE_URL points at the pooler
 * (port 6543), so we force the flag here regardless of how the env var is set
 * (the env value may omit it or already include it — we never duplicate).
 */
function getDatasourceUrl(): string {
  const raw = process.env.DATABASE_URL ?? ''
  try {
    const url = new URL(raw)
    // Only rewrite Postgres URLs. Never touch file:/other URLs used by the
    // local packaging scripts (.zscripts) — appending a query string there
    // would corrupt the file path.
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      return raw
    }
    if (!url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true')
    }
    return url.toString()
  } catch {
    // Malformed / missing URL — pass through unchanged; Prisma will surface a
    // clear configuration error instead of a Postgres-level one.
    return raw
  }
}

/**
 * PrismaClient is cached on globalThis in ALL environments.
 *
 * In serverless (Vercel) each cold lambda creates a fresh client, which opens
 * its own connection pool. Without the global cache the client (and its
 * prepared-statement cache) is recreated per request, exhausting connections
 * and amplifying 42P05 on the pooler. The cache is only skipped when the
 * module is evaluated for the first time in a process.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: getDatasourceUrl(),
    log: process.env.NODE_ENV !== 'production' ? ['query'] : [],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

// Assign in ALL environments (not just dev) so serverless instances reuse the
// client instead of recreating it per request.
globalForPrisma.prisma = db
