export const revalidate = 0

import { getSql } from '@/lib/db'
import DashboardClient from './DashboardClient'

async function getData(days, symbol) {
  const sql = getSql()

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [indices, logs] = await Promise.all([
    symbol === 'all'
      ? sql`SELECT * FROM index_daily WHERE trade_date >= ${sinceStr}::date ORDER BY trade_date ASC`
      : sql`SELECT * FROM index_daily WHERE trade_date >= ${sinceStr}::date AND symbol = ${symbol} ORDER BY trade_date ASC`,
    sql`SELECT * FROM index_fetch_log WHERE fetch_time >= (SELECT MAX(fetch_time) - interval '10 seconds' FROM index_fetch_log) ORDER BY fetch_time DESC`,
  ])

  console.log('indices count:', indices?.length, 'sinceStr:', sinceStr)
  return { indices, logs }
}

export default async function Page({ searchParams }) {
  const days = parseInt(searchParams?.days || '7')
  const symbol = searchParams?.symbol || 'all'
  const { indices, logs } = await getData(days, symbol)
  return <DashboardClient indices={indices} logs={logs} days={days} symbol={symbol} />
}
