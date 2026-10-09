# 卡点为什么这么爽 · 科普短片（v3）

一条约 3 分 29 秒的科普短片，讲清楚「卡点」为什么会让人觉得爽。BGM 是作者提供的音乐，按片子节奏重新编排过。

| 文件 | 规格 | 用途 |
| --- | --- | --- |
| `卡点为什么这么爽_v3_高清.mp4` | 1920×1080 · 60fps · H.264 约 3.3 Mbps · AAC 192k | 观看 / 投屏 |
| `卡点为什么这么爽_v3_分享版.mp4` | 1920×1080 · 60fps · 约 1 Mbps（2-pass）· 约 28 MB | 手机转发 |
| `source/` | 动画、配乐、旁白的全部制作源码 | 复现 / 修改 |

> 原始母版（CRF 14，约 143 MB）超过 GitHub 单文件 100 MB 的上限，没有放进仓库；高清版是由母版二次压制的。

## 片子结构

全片按 112.9 BPM 的拍网排布，共 392 拍。

| 时间 | 段落 | 内容 |
| --- | --- | --- |
| 0:00 | 开场 | 前 3 秒抛出问题，接着是一段卡点蒙太奇 |
| 0:17 | 片名 | 光环落下 |
| 0:21 | 定义 | 卡点 = 把画面事件对齐到音乐事件（鼓点、重拍） |
| 0:34 | 原因一 · 预测被兑现 | 节拍同步、预判下一拍、奖赏回路 |
| 0:57 | A/B 对比 | 先看不卡点的，再看卡点的，最后左右并排 |
| 1:10 | 原因二 · 视听合为一 | 视听绑定；「找出跟着鼓点闪的那个点」小实验 |
| 1:48 | 拍手实验 | 同一下拍手：同步 / 声音早 0.1 秒 / 声音晚 0.1 秒 |
| 2:05 | 剪辑经验 | 切点宁早勿晚 |
| 2:09 | 原因三 · 身体跟上拍 | 听到节奏时运动区域被激活 |
| 2:24 | 原因四 · 张力被释放 | 渐强、加密的军鼓、静默，然后落拍 |
| 2:50 | 平衡 | 太密会习惯；在「确定」与「意外」之间找平衡 |
| 3:09 | 总结 | 四个原因 |
| 3:15 | 回放 | 回看片中每一次转场都卡在拍上 |

## 制作方式

整片都是用代码生成的，没有用剪辑软件。

- **拍网**：从 BGM 中提取节拍（T ≈ 0.5314 秒，112.9 BPM）。画面和音效统一以鼓的真实起音为准（比拍网早约 25 ms）。
- **配乐编排**：先算小节之间的相似度矩阵，再用动态规划挑选小节顺序，让音乐的段落和片子的段落对齐。拼接处做 25 ms 等功率交叉淡化。另外合成了升调铺垫、加速军鼓、静默和落拍冲击。
- **旁白**：用 edge-tts 合成（zh-CN-YunxiNeural，语速 +8%），用词级时间戳把关键词对齐到拍点。音乐在人声下按频段闪避，整体响度约 −14.7 LUFS。
- **画面**：Canvas 2D 逐帧确定性渲染，由 Playwright 驱动 Chromium 截帧，再用 x264 编码。
  - 光环、冲击波、闪白、粒子、镜头推拉都由检测到的底鼓和军鼓驱动。
  - 跟着旁白出现的元素对齐到最近的八分音符。
- **校验**：用 `tools/synccheck.py` 检测成片的切点。
  - 转场切点相对鼓起音的中位偏差约 3 ms。
  - A/B 对比中卡点组的切点在 ±8 ms 内。
  - 拍手实验中早、晚两组的偏移实测约为 ±100 ms。

## 复现

依赖：

- Python 3 及 `numpy`、`scipy`、`librosa`、`soundfile`、`edge-tts`、`Pillow`
- Node 22，以及带 Chromium 的 Playwright
- ffmpeg

`source/` 里不含 BGM 原文件，需要自行放到 `source/audio/song.wav`（48 kHz 立体声）。

```bash
cd source
# 1. 节拍与小节分析（grid.json、ssm.npy 已附带，换音乐时才需要重跑）
python3 tools/analyze2.py audio/song.wav audio/beats.png audio/grid.json
python3 tools/bars.py audio/song.wav audio/grid.json audio/ssm.png

# 2. 旁白合成（tts/ 已附带；改了文案才需要重跑）
python3 tools/tts.py tools/script.json tts zh-CN-YunxiNeural +8%
python3 tools/tts.py tools/script_h2.json tts zh-CN-YunxiNeural +8%

# 3. 排版 → 配乐编排 → 混音 → 鼓点检测 → 可视化数据
python3 tools/layout.py
python3 tools/music_plan.py
python3 tools/mix.py          # 输出 audio/final_mix.wav
python3 tools/hits.py
python3 tools/vis_data.py

# 4. 渲染（需要在 film/ 下起一个本地服务）
cd film && npm install && python3 -m http.server 8765 &
DUR=208.877 node render.mjs ../out 60 4      # 输出目录 帧率 并行数
cd .. && ls out/chunk_*.mp4 | sed 's/^/file /' > out/list.txt   # 用 ffmpeg concat 格式列出分段
bash tools/finalize.sh out 卡点为什么这么爽.mp4
```

补充说明：

- `render.mjs` 和 `preview.mjs` 里 Playwright 的导入路径写的是 `/opt/node22/lib/node_modules/playwright`，换环境时需要按实际安装位置修改。
- `node preview.mjs out.png b100 b200` 可以按拍号预览单帧。
- `node sweep.mjs` 会逐 0.1 秒跑一遍 `renderFrame` 查错。

## 说明

- 旁白里关于大脑、多巴胺、视听绑定、运动区域的表述，是对相关研究的通俗化概括。真实效应存在个体差异，也不是卡点让人愉悦的唯一解释。
- 旁白是 AI 合成语音。
- 本仓库是公开仓库，片中的 BGM 会随视频一起公开可见。
