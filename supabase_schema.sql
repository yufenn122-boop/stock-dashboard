-- 1. 每日收盘数据表（趋势图数据源）
create table index_daily (
  id         bigserial primary key,
  symbol     text not null,          -- SPX / NDX / DJI / CSI300 / SSEC / GEM
  name       text,                   -- 标普500 / 纳斯达克 ...
  market     text,                   -- US / CN
  trade_date date not null,          -- 交易日期 2024-01-15
  close      numeric(12,4),          -- 收盘价
  change     numeric(12,4),          -- 涨跌额
  change_pct numeric(8,4),           -- 涨跌幅（百分比，如 -1.23）
  created_at timestamptz default now(),
  unique(symbol, trade_date)
);

create index idx_daily_symbol_date on index_daily(symbol, trade_date desc);

-- 2. 每次抓取的原始日志表（今日数据表数据源）
create table index_fetch_log (
  id         bigserial primary key,
  symbol     text not null,
  name       text,
  market     text,
  close      numeric(12,4),
  change     numeric(12,4),
  change_pct numeric(8,4),
  data_time  timestamptz,            -- 数据本身的时间戳
  fetch_time timestamptz default now(), -- 抓取时间
  source     text,                   -- 数据来源，如 yahoo / eastmoney
  status     text default 'success', -- success / error
  error_msg  text                    -- 失败时的报错信息
);

create index idx_log_fetch_time on index_fetch_log(fetch_time desc);

-- 3. 开启 RLS（可选，如果需要公开读取可跳过）
-- alter table index_daily enable row level security;
-- alter table index_fetch_log enable row level security;
-- create policy "public read" on index_daily for select using (true);
-- create policy "public read" on index_fetch_log for select using (true);

-- 4. 插入测试数据（验证页面是否正常）
insert into index_daily (symbol, name, market, trade_date, close, change, change_pct) values
('SPX',    '标普500',   'US', current_date - 6, 5200.00, 12.50,  0.24),
('SPX',    '标普500',   'US', current_date - 5, 5215.30, 15.30,  0.29),
('SPX',    '标普500',   'US', current_date - 4, 5198.10, -17.20, -0.33),
('SPX',    '标普500',   'US', current_date - 3, 5230.50, 32.40,  0.62),
('SPX',    '标普500',   'US', current_date - 2, 5245.80, 15.30,  0.29),
('SPX',    '标普500',   'US', current_date - 1, 5260.10, 14.30,  0.27),
('SPX',    '标普500',   'US', current_date,     5255.40, -4.70,  -0.09),
('NDX',    '纳斯达克',  'US', current_date - 6, 18200.00, 80.00,  0.44),
('NDX',    '纳斯达克',  'US', current_date - 5, 18350.20, 150.20, 0.83),
('NDX',    '纳斯达克',  'US', current_date - 4, 18280.50, -69.70, -0.38),
('NDX',    '纳斯达克',  'US', current_date - 3, 18420.30, 139.80, 0.76),
('NDX',    '纳斯达克',  'US', current_date - 2, 18510.60, 90.30,  0.49),
('NDX',    '纳斯达克',  'US', current_date - 1, 18480.90, -29.70, -0.16),
('NDX',    '纳斯达克',  'US', current_date,     18550.00, 69.10,  0.37),
('DJI',    '道琼斯',    'US', current_date - 6, 39200.00, 120.00, 0.31),
('DJI',    '道琼斯',    'US', current_date - 5, 39350.50, 150.50, 0.38),
('DJI',    '道琼斯',    'US', current_date - 4, 39180.20, -170.30,-0.43),
('DJI',    '道琼斯',    'US', current_date - 3, 39420.80, 240.60, 0.61),
('DJI',    '道琼斯',    'US', current_date - 2, 39510.30, 89.50,  0.23),
('DJI',    '道琼斯',    'US', current_date - 1, 39480.60, -29.70, -0.08),
('DJI',    '道琼斯',    'US', current_date,     39550.10, 69.50,  0.18),
('CSI300', '沪深300',   'CN', current_date - 6, 3580.00, -15.20, -0.42),
('CSI300', '沪深300',   'CN', current_date - 5, 3610.30, 30.30,  0.85),
('CSI300', '沪深300',   'CN', current_date - 4, 3595.80, -14.50, -0.40),
('CSI300', '沪深300',   'CN', current_date - 3, 3625.40, 29.60,  0.82),
('CSI300', '沪深300',   'CN', current_date - 2, 3640.20, 14.80,  0.41),
('CSI300', '沪深300',   'CN', current_date - 1, 3618.90, -21.30, -0.59),
('CSI300', '沪深300',   'CN', current_date,     3635.50, 16.60,  0.46),
('SSEC',   '上证指数',  'CN', current_date - 6, 3280.00, -8.50,  -0.26),
('SSEC',   '上证指数',  'CN', current_date - 5, 3295.60, 15.60,  0.48),
('SSEC',   '上证指数',  'CN', current_date - 4, 3285.30, -10.30, -0.31),
('SSEC',   '上证指数',  'CN', current_date - 3, 3310.80, 25.50,  0.78),
('SSEC',   '上证指数',  'CN', current_date - 2, 3325.40, 14.60,  0.44),
('SSEC',   '上证指数',  'CN', current_date - 1, 3308.20, -17.20, -0.52),
('SSEC',   '上证指数',  'CN', current_date,     3318.90, 10.70,  0.32),
('GEM',    '创业板',    'CN', current_date - 6, 1820.00, -12.30, -0.67),
('GEM',    '创业板',    'CN', current_date - 5, 1845.60, 25.60,  1.41),
('GEM',    '创业板',    'CN', current_date - 4, 1832.40, -13.20, -0.71),
('GEM',    '创业板',    'CN', current_date - 3, 1858.90, 26.50,  1.45),
('GEM',    '创业板',    'CN', current_date - 2, 1872.30, 13.40,  0.72),
('GEM',    '创业板',    'CN', current_date - 1, 1855.80, -16.50, -0.88),
('GEM',    '创业板',    'CN', current_date,     1865.20, 9.40,   0.51);

insert into index_fetch_log (symbol, name, market, close, change, change_pct, data_time, source, status) values
('SPX',    '标普500',  'US', 5255.40, -4.70,  -0.09, now(), 'yahoo',     'success'),
('NDX',    '纳斯达克', 'US', 18550.00, 69.10,  0.37, now(), 'yahoo',     'success'),
('DJI',    '道琼斯',   'US', 39550.10, 69.50,  0.18, now(), 'yahoo',     'success'),
('CSI300', '沪深300',  'CN', 3635.50,  16.60,  0.46, now(), 'eastmoney', 'success'),
('SSEC',   '上证指数', 'CN', 3318.90,  10.70,  0.32, now(), 'eastmoney', 'success'),
('GEM',    '创业板',   'CN', 1865.20,   9.40,  0.51, now(), 'eastmoney', 'success');
