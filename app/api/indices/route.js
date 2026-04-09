export const dynamic = 'force-dynamic'

import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/indices?days=7&symbol=all
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '7')
  const symbol = searchParams.get('symbol') || 'all'

  const supabase = getSupabaseAdmin()
  const since = new Date()
  since.setDate(since.getDate() - days)

  let query = supabase
    .from('index_daily')
    .select('*')
    .gte('trade_date', since.toISOString().split('T')[0])
    .order('trade_date', { ascending: true })

  if (symbol !== 'all') {
    query = query.eq('symbol', symbol)
  }

  const { data, error } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
