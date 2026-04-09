export const dynamic = 'force-dynamic'

import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/today
export async function GET() {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('index_fetch_log')
    .select('*')
    .gte('fetch_time', today + 'T00:00:00')
    .lte('fetch_time', today + 'T23:59:59')
    .order('fetch_time', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
