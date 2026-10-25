# 设置与皮肤 · 1.0.14

2026-10-26，更新现有 `/Applications/文案审核台 · Apple.app`，未新增另一个应用实例。

## 功能

- 设置中提供苹果浅色、经典蓝、Quiet Blue三种皮肤，立即切换并随工作区保存。旧数据默认苹果浅色，未知皮肤值回退到默认；项目、成员、物料和审核历史保持原有数据。
- 三套样式以语义属性隔离，同时加载本地CSS。切换皮肤刷新Canvas主题色与几何测量，不重建审核任务。
- 共用顶栏SVG尺寸、对齐规则及键盘焦点策略；皮肤选择使用原生单选框，开关使用原生复选框。
- 设置减少为皮肤、减少动态效果、固定窗口、开机自启动及源代码入口。皮肤切换不要求重启。
- 开机自启动通过Electron系统登录项接口写入，并从macOS重新读取状态。系统设置中的外部改动会在重新打开/聚焦设置时同步；系统要求批准时提供说明和打开登录项的专用入口。
- 启动时使用`wasOpenedAtLogin`判断是否只保留菜单栏，手动打开仍显示窗口。移除已弃用的`openAsHidden`写入参数。接口参考：[Electron app文档](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)。
- Quiet Blue样式与对应MIT许可一并纳入当前应用，来源记录保留于`THIRD_PARTY_NOTICES.md`。

## 验证

- 52项自动测试通过，包含旧工作区迁移、三皮肤保存、未知输入回退、系统登录项外部状态同步、启停、待批准状态、可信IPC和登录启动不弹窗。
- `npm run build:mac:dir`、应用检查及`codesign --verify --deep --strict`通过。
- 实际安装版已逐一切换三皮肤，设置文字、选中边框、开关与玻璃浮层清晰完整。
- 实际安装版自启动开启→关闭→开启均从系统读取到对应状态。保留开启；未执行机器重启或退出登录，登录时不弹窗由主进程回归测试覆盖。
- 重启应用后Quiet Blue选择和自启动开启状态仍保留，随后恢复苹果浅色。设置截图：`/Users/gracylart/Documents/Codex/2026-10-26/review-settings/apple-settings-1.0.14.png`。
- 保持同一个bundle ID与用户目录，仅运行当前应用。
