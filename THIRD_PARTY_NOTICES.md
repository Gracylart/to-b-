# 第三方来源与许可

本文件说明文案审核台的设计来源、开源依赖及随应用分发的字体许可。应用自身的 `package.json` 声明为 `UNLICENSED`；以下第三方作品各自保留其原有许可。

## 设计与动效来源

- Studio 版的语义化 Surface 0–3、控件尺寸、焦点环、非线性滚动遮罩与动效曲线参考 [Caho1 / open-claude-ui](https://github.com/Caho1/open-claude-ui) 的纯 CSS 与逻辑规范，并针对本产品改为蓝色审核视觉。该项目采用 MIT 许可；本应用未引入其专有字体或二进制资产。
- 用户提供的 [Figma Glass Shell A / B / C 原型](https://www.figma.com/design/IBHECNJfQK2Dymy3CLCZAV/Codex-Dynamic-Workflow?node-id=173-2234) 为界面设计依据。`dist/assets/figma/` 保存从该文件获取的设计资源；本声明不将设计文件及其中品牌标识重新许可为 MIT。
- 原始 Codex Dynamic Workflow 动效来自用户的 [Gracylart / to-b- 仓库](https://github.com/Gracylart/to-b-)，对应原始提交 `ad01e19816fb4c141905aeb7ded460f9c64091af` 和[原始在线演示](https://codex-workflow-gracy.blush-tetra-1726.chatgpt.site/)。原演示保留于 `dist/reference/`。
- 菜单栏窗口形态及交互行为参考 [Javis603 / Token Monitor](https://github.com/Javis603/token-monitor)。其 [MIT 许可](https://github.com/Javis603/token-monitor/blob/main/LICENSE) 版权信息为 `Copyright (c) 2026 Javis`。本应用独立实现菜单栏壳、审核规则与交互；菜单栏的方块加校对标识为本项目生成的原创图标。

## 运行时与构建工具

| 项目 | 版本 | 用途 | 许可 |
| --- | --- | --- | --- |
| [Electron](https://github.com/electron/electron) | 44.9.1 | 桌面运行时 | MIT；其 Chromium 等组成部分另有许可 |
| [electron-builder](https://github.com/electron-userland/electron-builder) | 26.15.3 | 开发时打包工具 | MIT |

精确依赖版本和包完整性摘要记录在 `package-lock.json`。构建会将 Electron 的原始 `LICENSE` 和 `LICENSES.chromium.html` 分别复制到应用 `Contents/Resources/licenses/Electron-LICENSE` 和 `Contents/Resources/licenses/Chromium-LICENSES.html`，保留 Chromium 等组成部分的完整第三方声明。本文件同时复制到 `Contents/Resources/THIRD_PARTY_NOTICES.md`。构建开发依赖不会作为应用的 `node_modules` 一并打包。

## 字体

| 文件 | 字体版本 | 版权 |
| --- | --- | --- |
| `dist/assets/fonts/Inter.ttf` | Inter 4.001；git-66647c0bb | Copyright 2016 The Inter Project Authors |
| `dist/assets/fonts/RobotoMono.ttf` | Roboto Mono 3.001 | Copyright 2015 The Roboto Mono Project Authors |

版本与上表版权来自所分发字体的内嵌 metadata。Inter 的 Google Fonts 附带许可还包含 2020 年版权声明，一并保留于 [Inter-OFL.txt](dist/assets/fonts/Inter-OFL.txt)；Roboto Mono 原始许可见 [RobotoMono-OFL.txt](dist/assets/fonts/RobotoMono-OFL.txt)。两种字体使用 SIL Open Font License 1.1；下面保留版权声明和完整许可。字体项目来源为 [Inter](https://github.com/rsms/inter)、[Google Fonts / Inter](https://github.com/google/fonts/tree/main/ofl/inter) 和 [Roboto Mono](https://github.com/googlefonts/robotomono)。

SF Pro 及其他 macOS 系统字体由操作系统提供，不包含在本项目的分发文件中。

## MIT 许可

以下许可分别适用于 open-claude-ui、Token Monitor、Electron 和 electron-builder，其版权声明分别为：

```text
open-claude-ui:
Copyright (c) Caho1 contributors

Token Monitor:
Copyright (c) 2026 Javis

Electron:
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

electron-builder:
Copyright (c) 2015 Loopline Systems
```

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## SIL Open Font License 1.1

```text
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
Copyright 2015 The Roboto Mono Project Authors (https://github.com/googlefonts/robotomono)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## PDF components

- pdf-lib and @pdf-lib/fontkit: MIT; license files included with their packaged modules.
- pdfjs-dist: Apache-2.0; license included with packaged module.
- Noto Sans SC: SIL Open Font License 1.1. Copyright and full license: dist/assets/pdf/OFL.txt. Source: https://github.com/google/fonts/tree/main/ofl/notosanssc .
# Studio 本地项目文件归集补充

- SheetJS Community Edition 0.20.3，Apache-2.0，来源为官方 CDN `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`。版权与完整许可保留在随应用打包的 `node_modules/xlsx/LICENSE` 中。
- 本机独立安装的 Ollama v0.40.11（MIT）和 Qwen3-0.6B（Apache-2.0）不随应用二进制重复分发。安装来源、权重校验值和本机存放位置见 `docs/project-file-integration.md`。

## 原生文件监听

使用 [@parcel/watcher 2.6.0](https://github.com/parcel-bundler/watcher)（MIT）及其 darwin-arm64 原生模块，许可原文随依赖包保留。Copyright (c) 2017-present Devon Govett。macOS 使用 FSEvents 后端，在独立进程中订阅目录树的变更。
