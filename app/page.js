'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const INDICES = [
  { symbol: 'SPX',    name: '标普500',   market: 'US' },
  { symbol: 'NDX',    name: '纳斯达克',  market: 'US' },
  { symbol: 'DJI',    name: '道琼斯',    market: 'US' },
  { symbol: 'CSI300', name: '沪深300',   market: 'CN' },
  { symbol: 'SSEC',   name: '上证指数',  market: 'CN' },
  { symbol: 'GEM',    name: '创业板',    market: 'CN' },
]

const COLORS = {
  SPX:    '#6366f1',
  NDX:    '#22c55e',
  DJI:    '#f59e0b',
  CSI300: '#ec4899',
  SSEC:   '#06b6d4',
  GEM:    '#f97316',
}

const DAY_OPTIONS = [
  { label: '7天',  value: 7 },
  { label: '30天', value: 30 },
  { label: '90天', value: 90 },
]

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n) {
  if (n == null) return '—'
  const v = Number(n)
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
}

function colorClass(n) {
  if (n == null) return 'flat'
  return Number(n) > 0 ? 'up' : Number(n) < 0 ? 'down' : 'flat'
}

function fmtTime(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('zh-CN', { hour12: false })
}

function fmtDate(str) {
  if (!str) return ''
  return str.slice(5)
}

export default function Dashboard() {
  const [days, setDays] = useState(7)
  const [activeSymbol, setActiveSymbol] = useState('all')
  const [latestMap, setLatestMap] = useState({})
  const [chartData, setChartData] = useState([])
  const [todayLogs, setTodayLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceStr = since.toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      let indicesQuery = supabase
        .from('index_daily')
        .select('*')
        .gte('trade_date', sinceStr)
        .order('trade_date', { ascending: true })

      if (activeSymbol !== 'all') {
        indicesQuery = indicesQuery.eq('symbol', activeSymbol)
      }

      const todayQuery = supabase
        .from('index_fetch_log')
        .select('*')
        .gte('fetch_time', today + 'T00:00:00')
        .order('fetch_time', { ascending: false })

      const [{ data: indices, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
        indicesQuery,
        todayQuery,
      ])

      if (e1) throw e1
      if (e2) throw e2

      // latest per symbol
      const lm = {}
      if (indices) indices.forEach(row => { lm[row.symbol] = row })
      setLatestMap(lm)

      // chart data grouped by date
      if (indices) {
        const byDate = {}
        indices.forEach(row => {
          const d = row.trade_date
          if (!byDate[d]) byDate[d] = { date: d }
          byDate[d][row.symbol] = row.close
        })
        setChartData(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)))
      }

      setTodayLogs(logs || [])
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [days, activeSymbol])

  useEffect(() => { loadData() }, [loadData])

  const failedLogs  = todayLogs.filter(r => r.status !== 'success')
  const lastFetch   = todayLogs[0]?.fetch_time
  const allSuccess  = todayLogs.length > 0 && failedLogs.length === 0

  const visibleSymbols = activeSymbol === 'all'
    ? INDICES.map(i => i.symbol)
    : [activeSymbol]

  return (
    <div className="container">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>股指监控看板</h1>

      {error && (
        <div className="status-banner error" style={{ marginBottom: 16 }}>
          <span className="status-dot red" />
          {error}
        </div>
      )}

      {todayLogs.length > 0 && (
        <div className={`status-banner ${allSuccess ? 'success' : 'error'}`}>
          <span className={`status-dot ${allSuccess ? 'green' : 'red'}`} />
          {allSuccess
            ? <>所有数据均抓取成功 &nbsp;·&nbsp; 最近抓取：{fmtTime(lastFetch)}</>
            : <>抓取失败：{failedLogs.map(r => r.name || r.symbol).join('、')}</>
          }
        </div>
      )}

      <div className="cards-grid">
        {INDICES.map(idx => {
          const row = latestMap[idx.symbol]
          const isActive = activeSymbol === idx.symbol
          return (
            <div
              key={idx.symbol}
              className={`card ${isActive ? 'active' : ''}`}
              onClick={() => setActiveSymbol(isActive ? 'all' : idx.symbol)}
            >
              <div className="card-name">{idx.name}</div>
              <div className="card-symbol">{idx.symbol} · {idx.market}</div>
              <div className={`card-price ${colorClass(row?.change_pct)}`}>
                {fmt(row?.close)}
              </div>
              <div className={`card-change ${colorClass(row?.change_pct)}`}>
                {row ? `${fmtPct(row.change_pct)}  ${row.change >= 0 ? '+' : ''}${fmt(row.change)}` : '暂无数据'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="chart-section">
        <div className="chart-header">
          <span className="chart-title">
            {activeSymbol === 'all' ? '全部指数趋势' : INDICES.find(i => i.symbol === activeSymbol)?.name + ' 趋势'}
          </span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="btn-group">
              {DAY_OPTIONS.map(o => (
                <button key={o.value} className={`btn ${days === o.value ? 'active' : ''}`} onClick={() => setDays(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="btn-group">
              <button className={`btn ${activeSymbol === 'all' ? 'active' : ''}`} onClick={() => setActiveSymbol('all')}>全部</button>
              {INDICES.map(idx => (
                <button
                  key={idx.symbol}
                  className={`btn ${activeSymbol === idx.symbol ? 'active' : ''}`}
                  onClick={() => setActiveSymbol(activeSymbol === idx.symbol ? 'all' : idx.symbol)}
                >{idx.name}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : chartData.length === 0 ? (
          <div className="loading">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#2d3148' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v} />
              <Tooltip
                contentStyle={{ background: '#1e2130', border: '1px solid #2d3148', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(v, name) => [fmt(v), INDICES.find(i => i.symbol === name)?.name || name]}
              />
              <Legend formatter={name => INDICES.find(i => i.symbol === name)?.name || name} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              {visibleSymbols.map(sym => (
                <Line key={sym} type="monotone" dataKey={sym} stroke={COLORS[sym]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="table-section">
        <div className="table-title">今日原始抓取数据</div>
        {todayLogs.length === 0 ? (
          <div style={{ color: '#64748b', padding: '20px 0' }}>今日暂无抓取记录</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>指数名</th><th>代码</th><th>市场</th><th>最新价</th>
                <th>涨跌额</th><th>涨跌幅</th><th>数据时间</th><th>抓取时间</th>
                <th>来源</th><th>状态</th><th>报错</th>
              </tr>
            </thead>
            <tbody>
              {todayLogs.map((row, i) => (
                <tr key={i}>
                  <td>{row.name || '—'}</td>
                  <td style={{ color: '#94a3b8' }}>{row.symbol}</td>
                  <td>{row.market || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(row.close)}</td>
                  <td className={colorClass(row.change)}>{row.change != null ? (row.change >= 0 ? '+' : '') + fmt(row.change) : '—'}</td>
                  <td className={colorClass(row.change_pct)}>{fmtPct(row.change_pct)}</td>
                  <td>{fmtTime(row.data_time)}</td>
                  <td>{fmtTime(row.fetch_time)}</td>
                  <td style={{ color: '#64748b' }}>{row.source || '—'}</td>
                  <td><span className={`badge ${row.status === 'success' ? 'badge-success' : 'badge-error'}`}>{row.status === 'success' ? '成功' : '失败'}</span></td>
                  <td style={{ color: '#ef4444', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.error_msg || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
