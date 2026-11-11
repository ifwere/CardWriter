# CardWriter 实施计划

把 `../client/client` 里的 Gingko Writer 客户端（Elm + 桌面壳）转写为一个独立、可在
macOS 12 (Intel / x86_64) 上运行的 Electron 应用。

## 逆向结论

- 官方桌面壳位于 `src/electron/`，Elm 桌面入口位于 `src/elm/Electron/`。
- 桌面端**不依赖**服务端、PouchDB、Dexie、IndexedDB；渲染进程只用到
  `src/shared/doc-helpers.js` 与 Elm。
- 主进程唯一的原生依赖是 `leveldown`（版本历史），本移植改为纯 JS 存储，
  从而实现零原生模块、可交叉打包。
- 原 webpack 配置已不再导出 Electron 配置，因此原桌面构建入口是失效的；
  本仓库重建构建链。
- 仓库自带的 mac 版 pandoc 是 `x86_64`，符合 Intel 目标。

## 技术选型

| 项 | 选择 | 原因 |
|---|---|---|
| 运行时 | Electron 32 (x64) | 支持 macOS 10.15+，含 macOS 12 Intel |
| 打包 | electron-builder 25 | dmg/zip，`minimumSystemVersion: 12.0` |
| Elm 编译 | `elm make --optimize` | 避免 webpack/loader 链 |
| 翻译 | 编译后占位符替换（移植 `elm-postprocess.mjs`） | 与原项目一致 |
| 渲染进程打包 | esbuild (bundle, iife) | 快、无配置负担 |
| 主进程 | 纯 CJS，直接复制 | 零转译、零运行时依赖 |
| 版本历史 | 自研 `VersionStore`（JSON 原子写） | 去掉 `leveldown` 原生模块 |
| 设置存储 | 自研 `Store`（JSON 原子写） | 去掉 `electron-store` |

## 提交与验收顺序

1. `chore: scaffold` — 目录、构建脚本、翻译后处理、单元测试。
2. `feat: app shell` — Home 窗口、菜单、preload、Elm Home。
3. `feat: document window & file io` — 新建/打开/保存/交换文件/备份/最近文档/文件关联。
4. `feat: version history` — `VersionStore` 替换 leveldown，历史读取/提交。
5. `feat: export` — Markdown / JSON / DOCX（内置 pandoc）。
6. `feat: import & modals` — JSON 导入、快捷键/视频/支持/FAQ 弹窗。
7. `ci: macos x64 build & e2e` — GitHub Actions + Playwright 冒烟测试。

每个提交都要求：`node --test tests/unit/` 通过；涉及 UI 的提交在 CI 的
macOS Intel runner 上构建并通过 Playwright 冒烟测试。

## 已验证事实

- **master 的桌面 Elm 入口不可编译**：它 import 了 `Page.Doc.activate` /
  `checkoutCommit`（已不再暴露），并期望旧的 `MsgToParent` 结构。
- 与桌面版 2.5.0 匹配的最后一致快照是 `origin/redesktop`（2022-06-23，
  package version 2.5.0）：其 `Electron.elm`、`Page.Doc`、`Doc.UI`、
  `Doc.Fullscreen`、`Outgoing` 端口全部自洽。本仓库以该快照为 Elm 基线。
- 快照的 ports（`SetDirty` / `CommitData` / `SaveToFile` / `ExportToFile`）
  与 `src/electron/*.js` 的 IPC 一一对应。
- 快照使用 MutationObserver + 原生 textarea（无 `gw-textarea` 自定义元素）。
- 渲染进程粘贴/复制需要改走 preload 的 clipboard API（`file://` 下不可靠）。
- 帮助窗口的 ports 与快照模块自洽；支持表单没有后端，改为 mailto。
