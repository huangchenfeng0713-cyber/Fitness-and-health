# 账号与云同步配置

官方 GitHub Pages 部署自 v1.5.1 起已在 `index.html` 注入项目的公开 Project URL 与
Publishable key。以下步骤仍适用于迁移项目、自行部署或轮换公开密钥；Google Client
Secret、数据库密码和 Secret key 始终只能保存在服务端控制台。

账号功能是可选的。全新设备没有配置 Supabase 时，应用保持“本地模式”，健康、饮食、设置和自定义食物只写入浏览器 IndexedDB，其他功能不受影响。若 IndexedDB 已明确归属于某个账号，配置被移除或账号服务暂时不可用时会继续锁定该账号数据，不能把它降级成访客数据展示。

配置后支持：

- 邮箱注册 / 密码登录 / 密码重置；
- Google 登录；
- 同一个已验证邮箱的 Google 与密码身份归入同一账号；
- 登录后绑定 Google，或为 Google 账号设置邮箱登录密码；
- 每个账号独立的云端快照、冲突选择与安全退出；
- v1.6.0 起支持 iPhone 快捷指令通过设备令牌自动写入每日健康数据。

如果账号最初由 Google 创建，之后想增加密码登录，必须先用 Google 登录，再在设置里的“管理登录方式”调用 `updateUser({ password })`。不要对同一邮箱再次点“注册账号”：Supabase 为防止枚举用户，不会用这条注册请求给既有 OAuth 用户补上密码。

## 1. 创建 Supabase 项目和数据表

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 创建项目。
2. 打开 SQL Editor，完整执行仓库中的 [`supabase/schema.sql`](../supabase/schema.sql)。
3. 确认表已启用 Row Level Security（RLS），策略只允许 `authenticated` 用户读写 `auth.uid() = user_id` 的行。

v1.6.0 还需要部署健康上传 Edge Function：

```bash
supabase functions deploy health-sync --no-verify-jwt
```

从 v1.6.3 升级到 v1.6.4 时也要重新完整执行一次 `supabase/schema.sql`，再重新部署
`health-sync`。迁移是幂等的：它会为步数、能量等累计指标补上各自的采集时间，
避免一次只上传部分指标时把同一行中保留的旧值再次下发；不会删除现有健康记录。

**升级到 v1.7.0 必须重新部署 `health-sync`**，否则白天跑快捷指令时静息心率为 0 会让
整次上传返回 400，同一次的步数与能量一并丢失。这一版**只改了 Edge Function，
没有改 `schema.sql`**，不需要重跑 SQL：

```bash
supabase functions deploy health-sync --no-verify-jwt
```

### 自动部署（推荐，配一次就不用再管）

仓库里的 [`.github/workflows/deploy-health-sync.yml`](../.github/workflows/deploy-health-sync.yml)
会在 `supabase/functions/**` 有改动并合进 `main` 时自动部署。只需配一次：

1. Supabase 后台 → 右上角头像 → **Account Settings → Access Tokens** → 生成一个 token 并复制。
   - **Resource access** 选 Project，指到本项目（ref `kdkykrshqiamwecohxgw`）。
   - **Permissions** 至少给 Edge Functions 的写入权限，其余保持 None。
   - **Expires in 别用默认的 7 天**，选上限（目前最长 90 天）。到期后自动部署会失败，
     而网页照常更新，如果没注意到就会回到「前端是新的、服务端是旧的」这种最难查的状态。
     流程失败时会明确打出「多半是令牌过期」并给出换发地址，GitHub 也会发邮件通知。
     换发只需重新生成令牌并更新同名 secret，workflow 不用改。
2. GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，
   名字填 `SUPABASE_ACCESS_TOKEN`，值粘贴刚才的 token。
3. 之后合并 PR 即可；也可以在 **Actions → 部署 health-sync → Run workflow** 手动触发。

这条路全程在浏览器里完成，手机上也能配。

### 手动部署

后台 → Edge Functions → `health-sync` 的在线编辑器里，用仓库中
[`supabase/functions/health-sync/index.ts`](../supabase/functions/health-sync/index.ts)
的全文覆盖后点 Deploy。**注意 iPhone 上 Safari 在这个代码编辑器里没有「全选」，
只能逐行删，实际不可用**——手机上请走上面的自动部署。

部署完成后重新跑一次快捷指令，返回里应出现 `stored` / `skipped` / `rejected` 三个字段。

v1.6.5 增加了部署顺序保护：如果 Pages 已更新而数据库迁移尚未执行，网页会临时回退到
v1.6.3 的旧列读取，不会中断账号健康页；但只有完成上述迁移后，部分指标隔离才真正生效。

这里关闭的是 Supabase 用户 JWT 校验，因为 iPhone 快捷指令使用独立的高熵设备令牌；函数会自行校验 `X-Health-Sync-Token`，并且只有函数内部的 service role 能调用写入 RPC。不要把 service role key 配进快捷指令或网页。

前端只能使用 Supabase 的 **Publishable key**（旧项目可能显示为 `anon` key）。绝对不要把 `service_role`、数据库密码或 Google Client Secret 放进仓库、网页源码、GitHub Actions 日志或浏览器存储。

Publishable key 会随网页下发，它不是服务器密钥；账号隔离依赖数据库 RLS，不能靠前端隐藏按钮实现。

## 2. 开启邮箱密码登录

在 Supabase Dashboard 的 **Authentication → Providers → Email** 中启用 Email。

生产环境建议保留“确认邮箱”。只有完成验证的邮箱才能可靠地与同邮箱 Google 身份自动关联；测试时若临时关闭确认邮箱，上线前应恢复并重新检查账号合并行为。

如果要显示“绑定 Google 登录”按钮，还需在 Authentication 的安全设置中启用 **Manual identity linking**。即使不启用手动绑定，同一已验证邮箱在后续使用 Google 登录时仍会按 Supabase 的自动关联规则归入同一用户；上线前必须用真实测试账号验证这两条路径。

在 **Authentication → URL Configuration** 中设置：

- Site URL：正式站点地址，例如 `https://example.github.io/Fitness-and-health/`；
- Redirect URLs：加入正式站点地址，以及开发时实际使用的地址，例如 `http://localhost:8080/**`。

重置密码邮件和 OAuth 登录都会使用这里允许的回跳地址。正式环境应尽量列出精确地址，不要使用过宽的通配范围。

## 3. 开启 Google 登录

按 [Supabase Google 登录文档](https://supabase.com/docs/guides/auth/social-login/auth-google) 创建 Google OAuth Web Client，并在 Google Cloud Console 中把 Supabase 回调地址加入 Authorized redirect URIs：

```text
https://<你的项目引用>.supabase.co/auth/v1/callback
```

然后在 Supabase **Authentication → Providers → Google** 填入 Google Client ID 与 Client Secret。Google Client Secret 只保存在 Supabase 后台，不能写入本仓库。

Google OAuth 的“Authorized JavaScript origins”应包含正式站点 origin；本地开发时再加入 `http://localhost:8080`。

## 4. 注入前端公开配置

应用从 `window.__HEALTH_DIET_CLOUD_CONFIG__` 读取以下字段：

```html
<script>
  window.__HEALTH_DIET_CLOUD_CONFIG__ = {
    supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
    supabasePublishableKey: 'YOUR_PUBLISHABLE_KEY'
  };
</script>
<script type="module" src="js/app.js"></script>
```

这段配置必须出现在 `js/app.js` 之前。也可以由部署平台在生成页面时注入同名全局对象。不要把示例占位符替换成 `service_role` key。

可选字段 `table` 仅用于自托管或迁移后的自定义表名；默认与 `supabase/schema.sql` 一致，普通部署不要修改。

配置完整时，应用才会按需加载固定版本的 `@supabase/supabase-js` ESM 客户端；配置缺失、格式错误或网络不可用时不会阻塞全新访客设备的本地模式。设备若已有账号归属数据，则会显示隐私锁，等账号服务恢复并由原账号重新验证后再解锁。

从 v1.6.4 起，首次打开时若 SDK/CDN 或网络暂时不可用，页面不会把这次失败永久记住：网络恢复后会自动重新连接，登录按钮也会触发重试；隐私锁界面可直接点击“重新连接账号服务”，无需先刷新整页。账号归属确认开始于个人资料 UI 渲染之前，主视图和设置抽屉共用同一保护状态。

## 5. 数据迁移、冲突与退出语义

- **首次登录且云端为空**：本机没有记录时创建空账号；本机已有但缺少可靠账号归属的记录时先锁定，让用户明确点“确认属于我并上传”，绝不自动认领。
- **云端已有数据**：先下载账号快照；若本机还有另一份未归属数据，暂停同步并让用户选择“使用云端数据”或“使用这台设备的数据”。
- **普通修改**：本地写入后标记待同步，云端用 revision 做并发校验，避免较旧标签页静默覆盖较新数据。
- **大快照写入**：上传成功后只回传 revision 与更新时间，不再把刚上传的整份 payload 下载一遍；写入响应按元数据单独校验，不会因未回传 payload 而误报“云端数据格式无效”。普通云端读取限时 12 秒，账号快照上传单独留出 30 秒，并在超时时显示本次快照大小。账号数据仍按整份快照写入，历史记录特别多时应避免连续反复点击同步。
- **不确定写入恢复**：若服务器已收下上传，但客户端在确认响应到达前超时或中断，下次启动/同步会比较云端与本机业务数据（忽略每次导出都会变化的 `exportedAt`）；内容一致时只补记 revision，内容不同仍进入冲突选择，不会静默覆盖。
- **快捷指令上传**：直接更新 `health_daily`；同一账号和日期只保留一行，但步数、能量等累计指标各自按采集时间独立更新，部分上传不会重放同一行中其它旧字段，重复请求也不会重复累加。体重、体脂率、静息心率和最大摄氧量按各自 `measuredAt` 归到真实测量日，不会被每次轮询复制成每日新样本。网页启动、回到前台及保持打开期间会把新行合并到本地，再沿用现有账号快照同步。
- **恢复备份或清空数据**：登录状态下也属于账号修改，会在二次确认后同步替换或清空该账号的云端快照；它们不再只是“本机操作”。
- **切换账号**：不会把上一个账号的数据上传给下一个账号。
- **安全退出**：本机存在待上传修改时，先校验 revision 并上传；本机已经同步时无需为了退出再次读取云端，因为其它设备的新版本本来就安全存在云端。上传失败或检测到冲突时不会清除本机数据；同步异常界面还提供“保留本机记录并退出”，它会退出会话但把原账号副本锁定在本机，只能重新登录原账号后恢复。

云同步不是备份历史版本系统。大规模导入 Apple 健康数据、恢复备份或处理冲突前，仍建议先在“数据 → 本应用备份与恢复”导出 JSON。

单个账号快照上限为 **8 MB**。达到上限时应用会停止上传并保留本机数据，需先导出备份并精简记录；不会为了同步成功而自动删减健康或饮食内容。

RLS 隔离的是不同普通账号，云快照并非端到端加密：Supabase 项目管理员以及持有 `service_role` 的受信任运维人员理论上可以访问数据库内容。应只把该密钥保存在受控后台，并按健康数据的敏感级别选择项目区域、访问人员和备份策略。

本机“隐私锁”用于阻止应用界面和正常写入流程在账号归属未确认时读取、修改或误传数据，但 IndexedDB 副本本身没有静态加密。同一操作系统/浏览器配置文件的拥有者仍可能借助开发者工具读取它。共享设备应使用独立的系统用户或浏览器配置文件，并在离开前完成“安全退出”；意外掉线时保留的未同步锁定副本是为了恢复数据，不是密码学保险箱。

## 6. 上线前检查

建议至少用两个浏览器配置文件和两个测试邮箱完成以下检查：

1. 未注入配置时显示“本地模式”，可以正常记录饮食和导入 Apple 健康数据。
2. 邮箱注册、验证、登录、忘记密码均能回到正确站点地址。
3. Google 登录成功；同一已验证邮箱不会产生两份应用数据。
4. 密码账号可以绑定 Google；Google 账号可以设置密码并用同邮箱登录。
5. A 账号的数据在 B 账号中不可见；直接通过浏览器请求修改其他 `user_id` 会被 RLS 拒绝。
6. 两台设备同时修改会出现冲突选择，不会自动覆盖。
7. 本机已同步时，断网仍可正常安全退出；本机有未上传修改时应拒绝清库，并出现“保留本机记录并退出”。使用后会退出会话、锁住原账号副本，重新登录原账号可以恢复。
8. 清除站点数据后重新登录，可以从当前账号恢复云端快照。
9. 账号首次成功加载后关闭网络并重新打开页面；同一有效本地会话应能读取本机副本并把新修改标为待同步，其他账号仍不能接管。
10. 生成一个设备连接，用快捷指令或 HTTP 测试请求上传当天数据；确认旧时间戳不能覆盖新值、重复请求不增加记录、撤销设备后请求返回 401。

快捷指令逐步配置见 [`SHORTCUT_SYNC.md`](SHORTCUT_SYNC.md)。

相关官方文档：

- [Supabase Auth 身份关联](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
