# 文案审核台 · Studio

当前版本 **1.2.1**（2026-10-28）。基于已有审核台桌面应用和侧栏 UI，加入本地项目文件发现、归集与打开功能。桌面产品只有侧栏形态：屏幕边缘把手 → 悬停展开图标栏 → 点击项目图标，在侧栏内查看文件。

[当前项目进度](docs/progress-2026-10-28.md) · [文件归集与本地模型](docs/project-file-integration.md) · [侧栏设计演进](docs/studio-sidebar.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

## 当前体验

- 默认停靠屏幕右侧，空闲时仅保留窄把手；悬停展开不抢焦点，离开后延迟收起。支持左侧停靠和横向图标栏。
- 一个项目图标对应一个项目文件夹入口，点击后继续在侧栏面板交互。收起面板返回图标栏；关闭请求返回边缘把手。不提供普通窗口、最小化、最大化或全屏入口。
- 同时监听已授权的桌面、下载和自选项目目录，自动发现新增、改名与删除的文件。项目总目录从底部的文件来源设置选择。
- 识别 `项目号-产品名-物料[-变更后缀]` 与项目号文件夹；按物料聚合版本，按阶段展示表格，借用料保留来源项目和引用关系。
- 文件名和路径不足以判断时，提取 PDF、Excel 或文本内容交给本地 Qwen 小模型。缺少可靠证据的文件留在“待确认”，可人工指定项目。
- 点击文件使用系统默认应用打开，文件夹按钮在 Finder 中定位。“集中”是项目内的虚拟聚合，原文件保留原处，不复制、移动或改名。

桌面版与浏览器参考原型分别保存数据。浏览器编辑器内的文字、布局调整不会自动修改桌面应用 UI；原有审核引擎、PDF 批注与修订模块保留在代码中，目前桌面入口以侧栏项目文件交互为主。

## 使用桌面应用

构建后将 `文案审核台 · Studio.app` 放入「应用程序」并打开。应用默认不显示 Dock 图标，屏幕边缘把手和顶部菜单栏均可唤出侧栏。

1. 打开侧栏底部的文件来源设置，确认桌面和下载来源，选择项目总目录。
2. 按 macOS 提示允许所选目录的访问。来源被拒绝时会暂停，通过“重新选择”恢复；后台不会反复重试被拒绝的来源。
3. 点击项目图标，在“物料 / 阶段表格 / 借用 / 待确认”中查找文件。输入搜索或操作原生目录选择器时，面板保持展开。
4. 顶部菜单栏可切换停靠方向、竖栏或横栏、自动收起和登录启动。退出应用会停止其文件服务和本地模型进程。

当前构建使用临时签名，重新打包后的新版本可能再次触发系统目录授权；同版本重启已验证无需重新选择目录。正式签名与公证尚未配置。具体限制见[目录权限说明](docs/project-file-integration.md#目录权限)。

## 本地模型与数据

文件分类使用 **Qwen3-0.6B Q8_0**（约 639 MB），在 Ollama 中注册为 `qwen3:0.6b`，通过 `127.0.0.1:11437` 本地运行。项目归属还需原文或路径证据；不凭模型自报的置信度直接归集。

当前开发机已安装运行时与模型。它们保存在应用用户数据目录，不包含在 Git 源码或应用包内；新的机器需要另行准备运行时与模型，应用尚无自动下载向导。官方来源及校验值见[本机安装来源](docs/project-file-integration.md#本机安装来源)。

- 项目文件索引：`~/Library/Application Support/文案审核台 · Studio/project-files.json`。
- 本地运行时与权重：同目录下的 `runtime/` 和 `models/`。
- 项目、文案、设置及历史摘要：应用本地存储。示例项目不是用户真实项目。
- 文件归集不上传文档内容；历史修订模块的外部模型调用属于另行配置的功能。
- 扫描 PDF 和图片尚未接入 OCR；Excel 只读取数据，不执行公式或宏。

## 开发与验证

需要 Node.js 22.12 或更新版本。技术栈为 Electron、原生 HTML/CSS/ES Modules；macOS 原生文件监听使用 `@parcel/watcher`。

```bash
git clone https://github.com/Gracylart/to-b-.git
cd to-b-
npm ci
npm test
npm run check
npm start
```

首次安装需下载 Electron。当前自动化测试为 **76 项**，覆盖文件规则、版本和借用关系、实时监听、模型证据、进程恢复、IPC 来源与侧栏形态。

| 命令 | 用途 |
| --- | --- |
| `npm start` | 启动桌面侧栏 |
| `npm test` | 运行自动化回归测试 |
| `npm run check` | 检查语法、资源、CSP 和打包入口 |
| `npm run test:desktop-services` | 在真实 Electron Utility 进程中验证 PDF、Excel 和文件事件 |
| `npm run test:desktop-services -- --with-model` | 加测本地 Qwen 关联；需本机模型服务已就绪 |
| `npm run preview` | 启动浏览器参考预览，默认端口 4173 |
| `npm run build:mac:dir` | 构建 Apple Silicon 应用目录 |
| `npm run build:mac` | 构建应用目录与 ZIP |

浏览器预览：`http://127.0.0.1:4173/preview.html`。可编辑参考原型：`http://127.0.0.1:4173/replica.html`。参考原型支持文字、删除、排序、跨分组移动、尺寸调整、撤销和浏览器内持久化；示例内容不连接真实文件索引。原始动效演示保留在 `/reference/`。

## macOS 构建

在 macOS Apple Silicon 主机执行：

```bash
npm ci
npm test
npm run build:mac
```

首次构建会准备 PDF 中文字体，需要 Python 3 和网络。当前产物路径：

```text
release/mac-arm64/文案审核台 · Studio.app
release/Copy-Review-Desk-Studio-1.2.1-arm64.zip
```

最低系统版本声明为 macOS 12，当前仅构建 arm64。应用采用 ad hoc 签名，未配置 Developer ID 或 Apple 公证；不捆绑 Apple 系统字体。渲染进程启用 sandbox、context isolation 与 CSP，关闭 Node integration，通过受限 IPC 使用原生服务。

## 代码与文档

```text
desktop/                   侧栏、边缘把手、目录监听、索引和本地模型服务
dist/index.html            桌面应用入口
dist/modules/              项目文件视图、审核与修订模块
dist/skins/                现有 UI 主题与文件侧栏样式
dist/replica*              可编辑参考原型
docs/                      当前进度、集成说明与历史设计验收
scripts/                   构建检查、原生服务验收、字体准备与预览服务
tests/                     自动化回归测试
```

源码仓库不包含本机文件索引、用户文档、API Key、模型权重、`node_modules/`、`release/` 或临时验收文件。当前同步为源码与开发记录，未发布安装包 Release。

## 来源

界面演进基于用户提供的 Figma 与侧栏参考图；边缘交互参考 [Javis603 / Token Monitor](https://github.com/Javis603/token-monitor)。原始动效源码与早期版本保留在 Git 历史中。依赖、字体与参考项目的版权和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
