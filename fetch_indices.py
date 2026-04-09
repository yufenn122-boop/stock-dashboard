"""
股指数据抓取脚本（Neon PostgreSQL 版）
- 美股（SPX / NDX / DJI）：每天早上 8:00 抓前一交易日收盘，用 yfinance
- A股（CSI300 / SSEC / GEM）：每天 15:10 抓当日收盘，用 akshare
- 单个指数失败不影响其他指数

依赖：pip install yfinance akshare psycopg2-binary python-dotenv
环境变量：DATABASE_URL=postgresql://...
"""

import os
import logging
import psycopg2
from datetime import date
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def upsert_daily(cur, row: dict):
    cur.execute("""
        INSERT INTO index_daily (symbol, name, market, trade_date, close, change, change_pct)
        VALUES (%(symbol)s, %(name)s, %(market)s, %(trade_date)s, %(close)s, %(change)s, %(change_pct)s)
        ON CONFLICT (symbol, trade_date) DO UPDATE SET
            close = EXCLUDED.close,
            change = EXCLUDED.change,
            change_pct = EXCLUDED.change_pct
    """, row)


def insert_log(cur, row: dict):
    cur.execute("""
        INSERT INTO index_fetch_log (symbol, name, market, close, change, change_pct, data_time, source, status, error_msg)
        VALUES (%(symbol)s, %(name)s, %(market)s, %(close)s, %(change)s, %(change_pct)s, %(data_time)s, %(source)s, %(status)s, %(error_msg)s)
    """, {
        "symbol":     row.get("symbol"),
        "name":       row.get("name"),
        "market":     row.get("market"),
        "close":      row.get("close"),
        "change":     row.get("change"),
        "change_pct": row.get("change_pct"),
        "data_time":  row.get("data_time"),
        "source":     row.get("source"),
        "status":     row.get("status", "success"),
        "error_msg":  row.get("error_msg"),
    })


# ---------------------------------------------------------------------------
# 美股（yfinance）
# ---------------------------------------------------------------------------

US_INDICES = [
    {"symbol": "SPX",  "name": "标普500",  "market": "US", "yf_ticker": "^GSPC"},
    {"symbol": "NDX",  "name": "纳斯达克", "market": "US", "yf_ticker": "^NDX"},
    {"symbol": "DJI",  "name": "道琼斯",   "market": "US", "yf_ticker": "^DJI"},
]


def fetch_us_index(meta: dict) -> dict:
    import yfinance as yf
    import math
    hist = yf.download(meta["yf_ticker"], period="5d", auto_adjust=True, progress=False)
    if hist.empty:
        raise ValueError(f"yfinance 返回空数据：{meta['yf_ticker']}")

    # 展平多级列名
    if hasattr(hist.columns, 'levels'):
        hist.columns = hist.columns.get_level_values(0)

    closes = hist["Close"].dropna()
    if len(closes) < 1:
        raise ValueError(f"Close 全为 nan：{meta['yf_ticker']}")

    close = float(closes.iloc[-1])
    prev_close = float(closes.iloc[-2]) if len(closes) >= 2 else close
    if math.isnan(close):
        raise ValueError(f"close 为 nan：{meta['yf_ticker']}")

    change = round(close - prev_close, 4)
    change_pct = round((change / prev_close) * 100, 4) if prev_close else 0.0

    return {
        "close":      close,
        "change":     change,
        "change_pct": change_pct,
        "trade_date": closes.index[-1].date().isoformat(),
        "data_time":  closes.index[-1].isoformat(),
    }


def fetch_us(cur):
    log.info("=== 开始抓取美股指数 ===")
    for meta in US_INDICES:
        try:
            data = fetch_us_index(meta)
            log.info(f"[{meta['symbol']}] close={data['close']} change_pct={data['change_pct']}%")
            upsert_daily(cur, {**meta, "trade_date": data["trade_date"], "close": data["close"], "change": data["change"], "change_pct": data["change_pct"]})
            insert_log(cur, {**meta, "close": data["close"], "change": data["change"], "change_pct": data["change_pct"], "data_time": data["data_time"], "source": "yfinance", "status": "success", "error_msg": None})
        except Exception as e:
            log.error(f"[{meta['symbol']}] 失败：{e}")
            insert_log(cur, {**meta, "close": None, "change": None, "change_pct": None, "data_time": None, "source": "yfinance", "status": "error", "error_msg": str(e)[:500]})


# ---------------------------------------------------------------------------
# A股（akshare）
# ---------------------------------------------------------------------------

CN_INDICES = [
    {"symbol": "CSI300", "name": "沪深300",  "market": "CN", "ak_code": "sh000300"},
    {"symbol": "SSEC",   "name": "上证指数", "market": "CN", "ak_code": "sh000001"},
    {"symbol": "GEM",    "name": "创业板",   "market": "CN", "ak_code": "sz399006"},
]


def fetch_cn_index(meta: dict) -> dict:
    import akshare as ak
    today = date.today().isoformat()

    # stock_zh_index_spot_sina 返回沪深所有指数，境外可访问
    df = ak.stock_zh_index_spot_sina()
    row = df[df["代码"] == meta["ak_code"]]
    if row.empty:
        log.warning(f"可用代码样本：{df['代码'].head(20).tolist()}")
        raise ValueError(f"未找到代码：{meta['ak_code']}")
    r = row.iloc[0]
    close      = round(float(r["最新价"]), 4)
    prev_close = round(float(r["昨收"]), 4) if "昨收" in r.index else close
    change     = round(float(r["涨跌额"]), 4) if "涨跌额" in r.index else round(close - prev_close, 4)
    change_pct = round(float(r["涨跌幅"]), 4) if "涨跌幅" in r.index else round((change / prev_close) * 100, 4) if prev_close else 0.0

    return {
        "close":      close,
        "change":     change,
        "change_pct": change_pct,
        "trade_date": today,
        "data_time":  today + "T15:00:00+08:00",
    }


def fetch_cn(cur):
    log.info("=== 开始抓取A股指数 ===")
    for meta in CN_INDICES:
        try:
            data = fetch_cn_index(meta)
            log.info(f"[{meta['symbol']}] close={data['close']} change_pct={data['change_pct']}%")
            upsert_daily(cur, {**meta, "trade_date": data["trade_date"], "close": data["close"], "change": data["change"], "change_pct": data["change_pct"]})
            insert_log(cur, {**meta, "close": data["close"], "change": data["change"], "change_pct": data["change_pct"], "data_time": data["data_time"], "source": "akshare", "status": "success", "error_msg": None})
        except Exception as e:
            log.error(f"[{meta['symbol']}] 失败：{e}")
            insert_log(cur, {**meta, "close": None, "change": None, "change_pct": None, "data_time": None, "source": "akshare", "status": "error", "error_msg": str(e)[:500]})


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if mode in ("us", "all"):
                fetch_us(cur)
            if mode in ("cn", "all"):
                fetch_cn(cur)
        conn.commit()
        log.info("=== 写入完成 ===")
    except Exception as e:
        conn.rollback()
        log.error(f"写入失败：{e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
