'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

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

export default function DashboardClient({ indices, logs, days, symbol }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Build latest map (last record per symbol)
  const latestMap = {}
  indices.forEach(row => { latestMap[row.symbol] = row })

  // Build chart data grouped by date
  const byDate = {}
  indices.forEach(row => {
    const d = row.trade_date
    if (!byDate[d]) byDate[d] = { date: d }
    byDate[d][row.symbol] = row.close
  })
  const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))

  const failedLogs = logs.filter(r => r.status !== 'success')
  const lastFetch  = logs[0]?.fetch_time
  const allSuccess = logs.length > 0 && failedLogs.length === 0

  const visibleSymbols = symbol === 'all' ? INDICES.map(i => i.symbol) : [symbol]

  function navigate(newDays, newSymbol) {
    startTransition(() => {
      router.push(`/?days=${newDays}&symbol=${newSymbol}`)
    })
  }

  return (
    <div className="container">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>股指监控看板</h1>

      {logs.length > 0 && (
        <div className={`status-banner ${allSuccess ? 'success' : 'error'}`}>
          <span className={`status-dot ${allSuccess ? 'green' : 'red'}`} />
          {allSuccess
            ? <>所有数据均抓取成功 &nbsp;·&nbsp; 最近抓取：{fmtTime(lastFetch)}</>
            : <>抓取失败：{failedLogs.map(r => r.name || r.symbol).join('、')}</>
          }
        </div>
      )}

      {/* Cards */}
      <div className="cards-grid">
        {INDICES.map(idx => {
          const row = latestMap[idx.symbol]
          const isActive = symbol === idx.symbol
          return (
            <div
              key={idx.symbol}
              className={`card ${isActive ? 'active' : ''}`}
              onClick={() => navigate(days, isActive ? 'all' : idx.symbol)}
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

      {/* Chart */}
      <div className="chart-section">
        <div className="chart-header">
          <span className="chart-title">
            {symbol === 'all' ? '全部指数趋势' : INDICES.find(i => i.symbol === symbol)?.name + ' 趋势'}
            {isPending && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>加载中...</span>}
          </span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="btn-group">
              {DAY_OPTIONS.map(o => (
                <button key={o.value} className={`btn ${days === o.value ? 'active' : ''}`} onClick={() => navigate(o.value, symbol)}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="btn-group">
              <button className={`btn ${symbol === 'all' ? 'active' : ''}`} onClick={() => navigate(days, 'all')}>全部</button>
              {INDICES.map(idx => (
                <button
                  key={idx.symbol}
                  className={`btn ${symbol === idx.symbol ? 'active' : ''}`}
                  onClick={() => navigate(days, symbol === idx.symbol ? 'all' : idx.symbol)}
                >{idx.name}</button>
              ))}
            </div>
          </div>
        </div>

        {chartData.length === 0 ? (
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

      {/* Today Table */}
      <div className="table-section">
        <div className="table-title">今日原始抓取数据</div>
        {logs.length === 0 ? (
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
              {logs.map((row, i) => (
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
