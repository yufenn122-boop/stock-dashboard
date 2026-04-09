# Stock Dashboard Dispatcher

Cloudflare Worker，作为 stock-dashboard GitHub Actions 的外部定时触发器。

## 触发时间

| Cron (UTC) | 北京时间 | 触发模式 |
|---|---|---|
| `1 0 * * 1-5` | 08:01 | `us`（美股） |
| `1 7 * * 1-5` | 15:01 | `cn`（A股） |

## 工作逻辑

1. 按时间判断触发 `us` 还是 `cn` 模式
2. 检查今天是否已有成功的 workflow run
3. 有则跳过，没有则调用 GitHub API 触发 `workflow_dispatch`

## 一次性部署

```bash
cd stock-dashboard/cloudflare_dispatcher
npm install -g wrangler
wrangler login
wrangler secret put GITHUB_TOKEN
wrangler deploy
```

`GITHUB_TOKEN` 需要对 `yufenn122-boop/stock-dashboard` 仓库有 Actions: Read and write 权限。

## 手动触发

```bash
# 触发美股
curl -X POST https://<your-worker>.workers.dev/run -H "Content-Type: application/json" -d '{"mode":"us"}'

# 触发A股
curl -X POST https://<your-worker>.workers.dev/run -H "Content-Type: application/json" -d '{"mode":"cn"}'

# 触发全部
curl -X POST https://<your-worker>.workers.dev/run -H "Content-Type: application/json" -d '{"mode":"all"}'

# 健康检查
curl https://<your-worker>.workers.dev/health
```

## 本地测试

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入真实 GITHUB_TOKEN
wrangler dev --test-scheduled
```
