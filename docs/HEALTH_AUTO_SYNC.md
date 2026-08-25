# Apple 健康自动同步（测试分支）

此方案以 `health_daily` 作为健康数据的云端权威来源：

Apple 健康 → iPhone 快捷指令 → Supabase Edge Function → `health_daily` → GitHub Pages 网页

## 一次性部署

1. 在 Supabase SQL Editor 执行 `supabase/health_sync.sql`。
2. 部署 Edge Function：`supabase functions deploy health-sync --no-verify-jwt`。
   - `--no-verify-jwt` 是有意的：快捷指令不持有网页登录 JWT，而使用独立的 `X-Health-Sync-Token`。
   - Function 内部使用 Supabase 自动提供的 `SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY`，service-role 密钥不会进入网页或快捷指令。
3. 打开站点的 `/sync-setup.html`，登录后创建一个设备令牌。
4. 把接口 URL 与令牌填进 iPhone 快捷指令。

## 快捷指令请求

- 方法：POST
- Header：`X-Health-Sync-Token: hds_...`
- Content-Type：`application/json`

```json
{
  "protocolVersion": 1,
  "syncId": "2026-08-25T14:10:00+08:00-001",
  "capturedAt": "2026-08-25T14:10:00+08:00",
  "date": "2026-08-25",
  "timezone": "Asia/Shanghai",
  "source": "apple_shortcuts",
  "steps": 1594,
  "activeEnergy": 103.21,
  "restingEnergy": 791.67,
  "exerciseMinutes": 3,
  "standMinutes": 36,
  "distanceKm": 1.113,
  "sleepMinutes": 352,
  "restingHR": 70
}
```

可选测量时间字段：`weightMeasuredAt`、`bodyFatMeasuredAt`、`restingHRMeasuredAt`、`vo2maxMeasuredAt`。如果上传对应测量值而没有提供测量时间，接口使用 `capturedAt` 作为兜底。

## 一致性规则

- `syncId` + 设备唯一，重复请求幂等。
- 同一天的累计数据只接受 `capturedAt` 不早于现有记录的请求；旧请求不能覆盖新值。
- 累计值覆盖，不相加。
- 体重、体脂、静息心率、VO₂max 按各自测量时间决定是否覆盖。
- `health_sync_events` 保留最近 30 天的同步事件，供排查重复/陈旧请求。
- 设备原始令牌只在浏览器生成时显示一次；数据库保存 SHA-256 哈希。撤销设备后旧令牌立即失效。

## 网页同步

`js/lib/health-daily-sync.js` 在已登录状态下：

- 页面打开时读取 `health_daily`；
- 登录后再读取一次；
- 页面从后台回到前台时读取；
- 如 Supabase Realtime 可用，`health_daily` 变化后立即刷新；
- 将数据镜像到本机 IndexedDB，使现有离线计算和趋势页无需重写；
- 服务端健康刷新直接写本机 health store，不触发 `user_snapshots` 的 dirty/upload 流程，因此不会因为健康同步而改写饮食、设置或自定义食物快照。

v1.5.1 的 `user_snapshots` 仍可能包含兼容性的健康副本，但它不再是自动同步的写入目标；快捷指令只写 `health_daily`。迁移脚本会先把已有 snapshot 中的历史健康记录复制到 `health_daily`。
