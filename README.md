# Codex Dynamic Workflow

交互动效仪表盘，复刻并展示「任务网格 → 飞行粒子 → 提交统计栏」的工作流。

在线版本：https://codex-workflow-gracy.blush-tetra-1726.chatgpt.site/

## 技术栈

原生 HTML、CSS 和 JavaScript，使用 Canvas 绘制粒子；无需框架、构建工具或第三方运行依赖。

## 本地运行

```bash
git clone https://github.com/Gracylart/to-b-.git
cd to-b-
python3 -m http.server 8765 --directory dist
```

打开 http://localhost:8765/ 。

也可用任意静态 Web 服务器托管 `dist/`。

## 文件结构

- `dist/index.html`：仪表盘页面与控件。
- `dist/style.css`：深色主题、网格布局与界面动效。
- `dist/app.js`：Canvas 粒子、播放时间轴、统计、搜索与交互。
- `.openai/hosting.json`：现有 Sites 静态部署配置。

## 交互

- 任务从网格飞入统计栏，落地时更新计数。
- 暂停、继续、重播、时间轴定位与播放速度调整。
- 按 crate 名称搜索。
- 分配、摘要、保存视图、导出与复制链接等演示交互。

这是前端交互演示，数据与审核/代理执行状态为模拟数据，未连接真实 Codex 任务后端，AI summary 不调用模型。

## 来源版本

对应 Sites 第 2 版，原始源码提交：`ad01e19816fb4c141905aeb7ded460f9c64091af`。
