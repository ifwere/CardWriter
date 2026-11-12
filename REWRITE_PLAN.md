# Elm → React 19 + TypeScript 重写计划

## 背景与目标

当前写作 UI 是 Elm 0.19.1（`redesktop` 2.5.0 快照）。Elm 已停止演进，生态与协作成本高，后续新功能（AI、搜索、同步等）难以扩展。本计划把渲染层迁移到 **React 19 + TypeScript**，最终删除 Elm。

已确认的约束：

- 目标平台不变：**macOS 12 Intel**，Electron 外壳保留。
- **完全兼容**：继续读写 `.gkw` / `.gko`，保留 `userData` 下的版本历史对象格式，旧文档无缝打开。
- **分阶段替换**：每个阶段都可运行、可测试、可提交；编辑器最后替换。
- 本阶段**不实现新功能**；先完成技术栈迁移，架构为新功能留出扩展点。
- 不安装本地编译环境；构建与 E2E 由 GitHub Actions 完成。

## 目标技术栈

| 层 | 选择 | 说明 |
|---|---|---|
| 桌面外壳 | Electron 32 保持不变 | macOS 12 Intel 已验证可用；后续单独评估升级 |
| 渲染层 | **React 19 + TypeScript** | `tsc --noEmit` 做类型检查 |
| 打包 | **esbuild（IIFE）** | 不使用 Vite：`file://` 下 ES module 受 CORS 限制，IIFE 更稳；沿用现有构建链 |
| 编辑器状态 | **Zustand + Immer** | 单一文档 store，细粒度 selector，避免大树全量重渲染 |
| 拖拽 | **@dnd-kit/core** | 替代 Elm 中的 drag/drop 事件桥接 |
| 样式 | 复用现有 `src/static` CSS | 保留类名与 DOM id，降低视觉回归与 E2E 改动 |
| 国际化 | 复用 `i18n/*.json`，TS `t()` | 构建期打包 JSON；日期/相对时间改用 `Intl` |
| 主进程 | 保持 CommonJS，后续迁移 TS | 文件、版本历史、导出仍由主进程负责 |

### 为什么不用 Vite

Electron 通过 `loadFile` 加载 `file://` 页面，ES module 脚本在 `file://` 下会被 Chromium 的 CORS 规则拦截。要使用 Vite 就必须改用自定义协议或关闭 `webSecurity`，两者都会削弱当前的安全模型。esbuild 输出 IIFE，可直接沿用现有 CSP 与 `<script src>` 加载方式。

## 目标目录结构

```
src/renderer/
  shared/
    api.ts            # window.electronAPI 类型 + IPC 负载类型
    i18n.ts           # 语言目录、t()/tn()、Intl 日期
  home/
    main.tsx
    HomeApp.tsx
  help/               # 快捷键 / 视频 / 支持 / FAQ（阶段 2）
  editor/
    model/            # 树、Markdown 解析/序列化、历史（纯 TS，可单测）
    state/            # Zustand store
    components/       # 卡片、列、工具栏、历史滑块
    main.tsx
src/electron/         # 主进程、preload、菜单、文件与版本存储（保留）
```

## 兼容性红线

1. **Markdown 序列化必须与 `Coders.treeToMarkdownOutline` 一致**；解析必须等价于 `Coders.normalizeAndParse`。用黄金样例做字节级 round-trip 测试。
2. **版本对象不变**：`commit` / `tree` / `ref` 字段、SHA-1 计算、`heads/master`、`type` 分组键与 `src/electron/commit.js` 完全一致。
3. **文件与设置路径不变**：`.swp` 交换文件、`settings.json` 键、`versionhistory/<basename>-<sha1>/objects.log`。
4. **IPC 语义不变**：保存、提交、导出、关闭提示的时序保持现有行为。
5. 旧 `.gko` 文件维持当前“按文本读取”的行为，不新增格式转换。

## 分阶段实施

### 阶段 0：工具链与类型化 IPC 基础

- 增加 `react` / `react-dom` / `@types/*` / `typescript` / `zustand` / `immer`。
- 增加 `tsconfig.json` 与 `npm run typecheck`；CI 增加类型检查步骤。
- 新增 `src/renderer/shared/api.ts`，定义 `window.electronAPI` 与 IPC 负载类型。
- esbuild 支持 `.ts` / `.tsx`（`jsx: automatic`），输出仍为 IIFE。
- 现有 Elm 窗口全部保持可用。

### 阶段 1：React Home 窗口（本阶段首个可见替换）

- 用 React 实现 Home：New / Open / Import、最近文档列表、移除、2 秒刷新相对时间。
- 复用 `home.html` 的 DOM id 与 `home.css`，保证 E2E 选择器不变。
- i18n 使用现有语言目录；日期用 `Intl.RelativeTimeFormat` / `Intl.DateTimeFormat`。
- 保留 `elm-home.js` 构建产物作为临时回退，但页面不再引用；后续阶段删除。

### 阶段 2：React 帮助窗口

- 快捷键、视频、支持、FAQ 四个窗口迁移到 React，静态内容复用现有 CSS。
- 支持表单继续走 `mailto:` + `shell.openExternal`。

### 阶段 3：TS 核心模型（无 UI）

- 移植树模型、`.gkw` 解析/序列化、树操作、撤销/重做语义。
- 建立黄金文件测试：嵌套卡片、代码块、强调、空卡片、中文/表情、CRLF。
- 目标：新旧实现对同一文档的序列化结果逐字节一致。

### 阶段 4：React 文档外壳

- 文档布局、卡片渲染、选择/激活、滚动与列布局。
- 先实现只读渲染，再接编辑 textarea；使用 Zustand selector 控制重渲染。
- 复用 `desktop.css` / `style.css` 的类名。

### 阶段 5：交互对齐

- 键盘快捷键、拖拽、全屏、剪贴板、自动保存、`commit-data` 调用。
- 对齐 `LocalSaveDo` / `CommitDo` 的触发时机与状态指示器。

### 阶段 6：历史、导入、导出

- 版本历史滑块、checkout/restore；导出预览与 DOCX。
- 用 TS 重写 JSON 导入（替代 `elm-worker.js`）。

### 阶段 7：删除 Elm

- 删除 `src/elm`、Elm 构建步骤、`elm.json`、`scripts/translations.mjs` 的编译期替换逻辑中 Elm 相关部分。
- 清理 `package.json` 中的 Elm 依赖与旧 bundle；更新 README、CI、E2E、静态检查。
- 最终验证：CI 全绿 + 打包产物冒烟。

## 每个阶段的验证

- `npm run check`：结构/依赖/CSP 检查。
- `npm test`：主进程与构建逻辑单测。
- `npm run typecheck`：React/TS 类型检查（阶段 0 起）。
- `npm run build` + `npm run test:e2e`：Playwright 真实 Electron 冒烟。
- 阶段 3 起增加黄金文件 round-trip 测试。
- 所有验证在 GitHub Actions 的 `macos-15-intel` 上执行。

## 风险与回退

| 风险 | 缓解 |
|---|---|
| Markdown 解析/序列化不一致，旧文档视觉变化 | 阶段 3 先做字节级黄金测试，再写 UI |
| 大树重渲染性能 | Zustand selector + 记忆化卡片组件；必要时虚拟化列 |
| 无法本地验证 React 构建 | 每阶段保持 Elm 路径可回退；CI 失败时按日志修复 |
| 版本历史损坏 | 不改对象格式与 SHA-1 算法；迁移前后用同一 `objects.log` 回放测试 |
| CSP / `file://` 限制 | 保持 IIFE，不引入需要 eval 或远程模块的方案 |

## 首个提交范围（阶段 0 + 1）

1. 计划文档（本文件）。
2. TS/React 工具链与类型检查脚本。
3. 类型化 `electronAPI` 与 i18n 模块。
4. React Home 窗口与 `home.html` 切换。
5. 更新静态检查、构建输入与测试；CI 增加 `typecheck`。
