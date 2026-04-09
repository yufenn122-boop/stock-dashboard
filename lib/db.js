import { neon } from '@neondatabase/serverless'

export function getSql() {
  return neon(process.env.DATABASE_URL)
}
