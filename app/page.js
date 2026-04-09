import { createClient } from '@supabase/supabase-js'
import DashboardClient from './DashboardClient'

async function getData(days, symbol) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  let indicesQuery = supabase
    .from('index_daily')
    .select('*')
    .gte('trade_date', sinceStr)
    .order('trade_date', { ascending: true })

  if (symbol !== 'all') {
    indicesQuery = indicesQuery.eq('symbol', symbol)
  }

  const [{ data: indices }, { data: logs }] = await Promise.all([
    indicesQuery,
    supabase
      .from('index_fetch_log')
      .select('*')
      .gte('fetch_time', today + 'T00:00:00')
      .order('fetch_time', { ascending: false }),
  ])

  return { indices: indices || [], logs: logs || [] }
}

export default async function Page({ searchParams }) {
  const days = parseInt(searchParams?.days || '7')
  const symbol = searchParams?.symbol || 'all'
  const { indices, logs } = await getData(days, symbol)
  return <DashboardClient indices={indices} logs={logs} days={days} symbol={symbol} />
}
