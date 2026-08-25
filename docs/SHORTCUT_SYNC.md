# iPhone 快捷指令自动同步

v1.6.0 起，快捷指令可以把 Apple 健康数据直接写入当前登录账号，不再需要复制粘贴 JSON，网页也不必保持打开。

## 1. 在网页生成设备连接

1. 打开应用并登录。
2. 进入 **数据 → 数据管理 → 同步 Apple 健康**。
3. 填写设备名称，例如“我的 iPhone”，点击 **生成连接信息**。
4. 分别保存“上传 URL”和“设备令牌”，也可以点击 **复制完整配置**。

设备令牌只显示一次，服务端只保存它的 SHA-256 哈希。令牌丢失时不需要找回：撤销旧设备，再生成一份即可。不要把令牌放进 URL、截图或公开仓库。

## 2. 新建取数与上传快捷指令

不同 iOS 版本的动作名称可能略有差异，核心顺序如下。

### 当天累计指标

对下列每项添加“查找健康样本”，日期限制为“今天”，再计算**总和**：

| Apple 健康类型 | JSON 键 | 单位 |
| --- | --- | --- |
| 步数 | `steps` | 步 |
| 活动能量 | `activeEnergyKcal` | kcal |
| 静息能量 | `restingEnergyKcal` | kcal |
| 锻炼时间 | `exerciseMinutes` | 分钟 |
| 站立时间 | `standMinutes` | 分钟 |
| 步行 + 跑步距离 | `distanceKm` | km |
| 睡眠分析 | `sleepMinutes` | 分钟 |

这些值是“今天截至当前”的累计值。多次上传会用较新的累计值覆盖较旧值，不能在快捷指令里再和上次结果相加。

### 最新测量指标

对体重、体脂率和静息心率查找“最新一条”，不要计算多天总和；再用“获取健康样本的详细信息”取得该样本的开始日期，并按 ISO 8601 格式输出：

| Apple 健康类型 | 数值键 | 测量时间键 | 单位 |
| --- | --- | --- | --- |
| 体重 | `weightKg` | `weightMeasuredAt` | kg |
| 体脂率 | `bodyFatPct` | `bodyFatMeasuredAt` | %，例如 18.5 |
| 静息心率 | `restingHR` | `restingHRMeasuredAt` | bpm |
| 最大摄氧量 | `vo2max` | `vo2maxMeasuredAt` | ml/kg/min |

没有值的可选指标可以不放进字典，不要用 0 代替未知体重或体脂率。测量时间很重要：服务器会把“最近一次体重”归回真实测量日，避免每小时上传时把同一个旧体重误画成每天都有新测量。

### 组装 JSON 字典

添加“字典”动作，并放入以下键。`timestamp` 使用“当前日期”按 ISO 8601 格式输出；`date` 使用 `yyyy-MM-dd`：

```json
{
  "timestamp": "2026-08-25T14:10:00+08:00",
  "date": "2026-08-25",
  "timezone": "Asia/Shanghai",
  "source": "apple_shortcuts",
  "steps": 4217,
  "activeEnergyKcal": 203.6,
  "restingEnergyKcal": 912.4,
  "exerciseMinutes": 18,
  "standMinutes": 246,
  "distanceKm": 3.12,
  "sleepMinutes": 431,
  "weightKg": 59,
  "weightMeasuredAt": "2026-08-25T07:35:00+08:00",
  "bodyFatPct": 18.5,
  "bodyFatMeasuredAt": "2026-08-25T07:35:00+08:00",
  "restingHR": 70,
  "restingHRMeasuredAt": "2026-08-25T06:20:00+08:00"
}
```

`date`、`timestamp` 与 `timezone` 必须指向同一个本地日期。中国大陆使用 `Asia/Shanghai`；在其他地区使用自己的 IANA 时区名称。

### 发出请求

添加“获取 URL 内容”动作：

- URL：网页生成的“上传 URL”；
- 方法：`POST`；
- 请求体：`JSON`，内容选择刚才的字典；
- 标头 `Content-Type`：`application/json`；
- 标头 `X-Health-Sync-Token`：网页生成的设备令牌。

第一次运行时允许快捷指令读取所需的健康数据。响应中出现以下内容代表写入成功：

```json
{"ok":true,"applied":true,"date":"2026-08-25"}
```

`applied: false` 表示服务器已经有更新的同日数据，因此安全忽略了这次旧上传；`duplicate: true` 表示相同请求已处理过。

## 3. 设置自动化

在“快捷指令 → 自动化”中创建“特定时间”自动化，选择“立即运行”，然后调用刚才的上传快捷指令。可以设置 08:00、12:00、18:00、23:30 等多个时刻。

iOS 会受省电、锁屏、权限和系统调度影响，不承诺严格整点运行。网站每五分钟读取一次账号数据，并在启动或回到前台时立即检查；即使网站已经关闭，快捷指令上传仍会直接保存到账户。

## 4. 状态与故障处理

- 在数据页点击“立即读取账号最新数据”，可立刻验证上传结果。
- “最近上传”长期不更新：先在快捷指令里手动运行一次，检查健康权限和网络。
- 返回 `invalid_token`：令牌错误或设备已撤销；重新生成连接。
- 返回 `invalid_metric`：检查字段单位，尤其是体脂率应为 18.5 而不是 0.185。
- 返回 `date_timezone_mismatch`：`date`、`timestamp` 和 `timezone` 不是同一个本地日期。
- 返回 `rate_limited`：一小时请求过多，等待后再运行。
- 手动粘贴 JSON 时应使用英文半角引号；应用也会兼容常见中文弯引号和字段末尾空格。

在应用中撤销设备后，该令牌会立即失效。清空当前账号数据会同时删除账号健康同步数据并撤销全部设备。
安全退出网页账号不会自动撤销快捷指令：这样网页关闭或暂时退出时自动化仍能工作。若要停止某台 iPhone 上传，请先在数据页撤销对应设备。
