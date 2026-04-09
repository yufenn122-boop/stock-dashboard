"""
股指数据抓取脚本
- 美股（SPX / NDX / DJI）：每天早上 8:00 抓前一交易日收盘，用 yfinance
- A股（CSI300 / SSEC / GEM）：每天 15:10 抓当日收盘，用 akshare
- 单个指数失败不影响其他指数
- 结果写入 Supabase 的 index_daily 和 index_fetch_log 两张表

依赖安装：
  pip install yfinance akshare supabase python-dotenv

环境变量（.env 或系统环境变量）：
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
"""

import os
import logging
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supabase 客户端
# ---------------------------------------------------------------------------

def get_supabase():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


# ---------------------------------------------------------------------------
# 写入 Supabase
# ---------------------------------------------------------------------------

def upsert_daily(sb, row: dict):
    """写 index_daily，symbol+trade_date 唯一，冲突时更新"""
    sb.table("index_daily").upsert(row, on_conflict="symbol,trade_date").execute()


def insert_log(sb, row: dict):
    """写 index_fetch_log，每次抓取都追加一条"""
    sb.table("index_fetch_log").insert(row).execute()


# ---------------------------------------------------------------------------
# 美股抓取（yfinance）
# 场景：每天早上 8:00 运行，抓前一个交易日收盘价
# ---------------------------------------------------------------------------

US_INDICES = [
    {"symbol": "SPX",  "name": "标普500",  "market": "US", "yf_ticker": "^GSPC"},
    {"symbol": "NDX",  "name": "纳斯达克", "market": "US", "yf_ticker": "^NDX"},
    {"symbol": "DJI",  "name": "道琼斯",   "market": "US", "yf_ticker": "^DJI"},
]


def fetch_us_index(meta: dict) -> dict:
    """
    返回 dict，包含 close / change / change_pct / trade_date / data_time
    失败时抛出异常
    """
    import yfinance as yf

    ticker = yf.Ticker(meta["yf_ticker"])
    # 取最近 5 天，确保能拿到最新交易日（跳过周末/节假日）
    hist = ticker.history(period="5d")
    if hist.empty:
        raise ValueError(f"yfinance 返回空数据：{meta['yf_ticker']}")

    last = hist.iloc[-1]
    prev = hist.iloc[-2] if len(hist) >= 2 else None

    close = float(last["Close"])
    prev_close = float(prev["Close"]) if prev is not None else close
    change = round(close - prev_close, 4)
    change_pct = round((change / prev_close) * 100, 4) if prev_close else 0.0
    trade_date = hist.index[-1].date().isoformat()

    return {
        "close": close,
        "change": change,
        "change_pct": change_pct,
        "trade_date": trade_date,
        "data_time": hist.index[-1].isoformat(),
    }


def fetch_us(sb):
    log.info("=== 开始抓取美股指数 ===")
    for meta in US_INDICES:
        try:
            data = fetch_us_index(meta)
            log.info(f"[{meta['symbol']}] {meta['name']} close={data['close']} change_pct={data['change_pct']}%")

            daily_row = {
                "symbol":     meta["symbol"],
                "name":       meta["name"],
                "market":     meta["market"],
                "trade_date": data["trade_date"],
                "close":      data["close"],
                "change":     data["change"],
                "change_pct": data["change_pct"],
            }
            upsert_daily(sb, daily_row)

            log_row = {**daily_row, "data_time": data["data_time"], "source": "yfinance", "status": "success"}
            log_row.pop("trade_date", None)
            insert_log(sb, log_row)

        except Exception as e:
            log.error(f"[{meta['symbol']}] 抓取失败：{e}")
            insert_log(sb, {
                "symbol":    meta["symbol"],
                "name":      meta["name"],
                "market":    meta["market"],
                "source":    "yfinance",
                "status":    "error",
                "error_msg": str(e)[:500],
            })


# ---------------------------------------------------------------------------
# A股抓取（akshare）
# 场景：每天 15:10 运行，抓当日收盘价
# ---------------------------------------------------------------------------

CN_INDICES = [
    {"symbol": "CSI300", "name": "沪深300",  "market": "CN", "ak_symbol": "sh000300"},
    {"symbol": "SSEC",   "name": "上证指数", "market": "CN", "ak_symbol": "sh000001"},
    {"symbol": "GEM",    "name": "创业板",   "market": "CN", "ak_symbol": "sz399006"},
]


def fetch_cn_index(meta: dict) -> dict:
    """
    返回 dict，包含 close / change / change_pct / trade_date / data_time
    失败时抛出异常
    """
    import akshare as ak

    # stock_zh_index_spot_em 返回实时行情，包含今日收盘/最新价
    df = ak.stock_zh_index_spot_em()
    # 列名：代码, 名称, 最新价, 涨跌额, 涨跌幅, ...
    # ak_symbol 格式 sh000300 → 代码列是 000300
    code = meta["ak_symbol"][2:]  # 去掉 sh/sz 前缀
    row = df[df["代码"] == code]
    if row.empty:
        raise ValueError(f"akshare 未找到代码：{code}")

    r = row.iloc[0]
    close      = float(r["最新价"])
    change     = float(r["涨跌额"])
    change_pct = float(r["涨跌幅"])  # 已经是百分比数值，如 -0.52
    today      = date.today().isoformat()

    return {
        "close":      round(close, 4),
        "change":     round(change, 4),
        "change_pct": round(change_pct, 4),
        "trade_date": today,
        "data_time":  today + "T15:00:00+08:00",
    }


def fetch_cn(sb):
    log.info("=== 开始抓取A股指数 ===")
    for meta in CN_INDICES:
        try:
            data = fetch_cn_index(meta)
            log.info(f"[{meta['symbol']}] {meta['name']} close={data['close']} change_pct={data['change_pct']}%")

            daily_row = {
                "symbol":     meta["symbol"],
                "name":       meta["name"],
                "market":     meta["market"],
                "trade_date": data["trade_date"],
                "close":      data["close"],
                "change":     data["change"],
                "change_pct": data["change_pct"],
            }
            upsert_daily(sb, daily_row)

            log_row = {**daily_row, "data_time": data["data_time"], "source": "akshare", "status": "success"}
            log_row.pop("trade_date", None)
            insert_log(sb, log_row)

        except Exception as e:
            log.error(f"[{meta['symbol']}] 抓取失败：{e}")
            insert_log(sb, {
                "symbol":    meta["symbol"],
                "name":      meta["name"],
                "market":    meta["market"],
                "source":    "akshare",
                "status":    "error",
                "error_msg": str(e)[:500],
            })


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    import sys
    sb = get_supabase()

    # 支持命令行参数：python fetch_indices.py us / cn / all（默认 all）
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("us", "all"):
        fetch_us(sb)
    if mode in ("cn", "all"):
        fetch_cn(sb)

    log.info("=== 抓取完成 ===")


if __name__ == "__main__":
    main()
