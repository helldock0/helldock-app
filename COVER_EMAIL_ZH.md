# 应聘邮件 — Wuxi TEC 数据分析师 (中文版)

> 重要：这是机器翻译初稿，发送前请让母语者校对一遍 (尤其是术语 "scout dossier" / "round-level" / "side splits" 等)。

---

收件人：\[VCTCNPosting 联系方式 / TEC 招聘邮箱\]
发件人：James Joy · jamesjoy696@gmail.com · \[您的微信 / Discord / 电话\]
主题：TEC 数据分析师应聘 — VCT CN scouting 系统 + AG 样本分析报告

你好，

我看到 VCTCNPosting 发布的 TEC 数据分析师职位，想要应聘。与其描述我能做什么，我直接展示一下在职位发布后 3 天里我搭建的工具：

**线上 scouting 系统：** \[VERCEL_URL\]/pro-scout
**深度样本分析 — All Gamers (即 EWC LBF 把 TEC 横扫的对手)：** \[VERCEL_URL\]/pro-scout/all-gamers

该系统从 VLR.gg 抓取 VCT CN 所有比赛数据存入结构化数据库，然后为每支队伍生成对手分析报告 — 包括：地图池、攻防胜率、选手相对于联赛位置基线的表现、常用阵容、战术模式 (手枪局 / 经济局 / 安装率 / 领先和翻盘成功率)，以及一段 AI 生成的教练 memo。AI memo 使用 Google AI Studio 的 Gemma 4 31B 模型，通过专门设计的 prompt 让输出可以直接被主教练使用 — 不是装饰性的图表。

我选 AG 作为样本是因为他们是你们最近最痛的一场对手。系统识别出：他们最近趋势 +21.4pp 上升，但有 93% 领先收尾 / 27% 翻盘 的脆性，29% 的安装率 (pick-driven 进攻风格)，Septem7 是明显的压制目标。我对 Stage 2 赛程上的每个对手都能给出这种深度。

本周我已经联系了 Grid 关于 VCT 数据接口的合作 — 那才有 round-level 经济和位置数据 (VLR 无法暴露)。一旦正式加入团队，我搭的这套框架可以无缝对接更丰富的数据源。

技术栈：Next.js 14, Supabase, 自研 VLR 爬虫, Gemma 4 31B 生成 narrative。代码暂时未开源，可以约个会议讲架构。

随时可以视频面试，匹配你们的时区。

— James

---

## Loom 视频脚本 (录制 2-3 分钟)

1. **0:00–0:20** 标题画面：「Wuxi TEC · 数据分析师应聘 · James」
2. **0:20–0:45** 打开 `/pro-scout` — 平移展示队伍列表，"VCT 2026 CN Stage 1 全部 12 支队伍，数据来自 VLR.gg"
3. **0:45–1:30** 点击进入 All Gamers。读 AI memo。指出一个战术结论 (如 "93% 收尾 / 27% 翻盘 — 必须早期建立优势")，再指向支持这个结论的底层数据 (Tactical Patterns 卡片)。
4. **1:30–2:15** 翻到 Roster 表格。展示 f4ngeer/Septem7 对比。提到联赛基线列 ("这位选手 ACS 比该位置 p50 高 44 — 所以系统标他为 carry")。
5. **2:15–2:45** 翻到地图矩阵。展示 pick 分布 + 攻防胜率。指出 Pearl 0-2。
6. **2:45–3:00** 结尾：「这是我对 Stage 2 赛程上每个对手都能产出的报告。系统每队耗时约 20 秒。期待和你们沟通。」
