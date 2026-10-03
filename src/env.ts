export interface Env {
  DB: D1Database
  ENVIRONMENT: string
  SESSION_SECRET: string
  /** Allowed dashboard origin for CORS — set via wrangler secret or var */
  DASHBOARD_ORIGIN?: string
}
