# 版本发布说明功能使用指南

## 功能概述

应用现在支持在更新提示中展示发布说明，用户可以在更新前查看新版本的改进内容。

### 特性
- ✅ 自动从 `RELEASE_NOTES.md` 提取当前版本的发布说明
- ✅ 更新通知中可展开/折叠查看更新内容
- ✅ 支持 Markdown 格式（标题、列表等）
- ✅ 长期未更新用户会直接跳到最新版本

## 使用流程

### 1. 编写发布说明

每次发布新版本前，编辑 `RELEASE_NOTES.md`：

```markdown
## v1.0.1 (2026-03-10)

### 新增功能
- ✨ 新增自动更新发布说明功能
- ✨ 支持在更新提示中查看更新内容

### 优化改进
- 🎨 优化更新通知UI设计
- ⚡ 提升SVN操作响应速度

### 问题修复
- 🐛 修复合并冲突显示问题
- 🐛 修复窗口状态保存异常

---

## v1.0.0 (2026-03-09)
...之前的版本说明...
```

**格式要求**：
- 每个版本以 `## vX.Y.Z (日期)` 开头
- 版本号必须与 `package.json` 中的 `version` 一致
- 新版本放在文件顶部（最新版本在最上面）

### 2. 更新版本号

修改 `package.json` 的 `version` 字段：

```json
{
  "version": "1.0.1"
}
```

### 3. 构建并发布

```bash
# Windows 本地测试
npm run build:win:local

# 或分步执行
npm run build:win      # 构建
npm run publish:local  # 发布到本地 nginx
```

构建时会自动：
1. 执行 `scripts/extract-release-notes.js` 提取当前版本的发布说明
2. 将发布说明写入 `dist/latest.yml`
3. 客户端更新时读取并显示

### 4. 用户体验

当用户检查更新时：

1. **发现新版本** → 显示版本号 + "查看更新内容"按钮
2. **点击展开** → 显示发布说明（支持格式化）
3. **点击下载** → 开始下载新版本
4. **下载完成** → 提示重启安装

## 发布说明格式

支持的 Markdown 语法：

```markdown
## 二级标题
### 三级标题

- 列表项 1
- 列表项 2
- 列表项 3

正文内容会自动换行
```

渲染效果：
- **二级标题**：粗体、较大字体
- **三级标题**：半粗体、中等字体
- **列表**：自动缩进、项目符号
- **换行**：自动保留格式

## 常见问题

### Q1: 长期不更新的用户会怎样？

**A**: 会直接更新到最新版本，不会逐版本更新。

例如：
- 用户当前版本：v1.0.0
- 服务器最新版本：v1.0.5
- 用户检查更新：直接从 1.0.0 → 1.0.5
- 显示的发布说明：v1.0.5 的内容（不包含中间版本）

### Q2: 如何显示多个版本的累积更新？

**A**: 如果想让用户看到跨越多个版本的所有改进，可以在最新版本的发布说明中汇总：

```markdown
## v1.0.5 (2026-03-15)

### 本次更新（v1.0.5）
- ✨ 功能A
- 🐛 修复B

### 近期更新汇总（v1.0.1 - v1.0.4）
- ✨ 功能C（v1.0.4）
- ⚡ 优化D（v1.0.3）
- 🐛 修复E（v1.0.2）
- 🎨 改进F（v1.0.1）
```

### Q3: 发布说明不显示？

**排查步骤**：

1. 检查 `RELEASE_NOTES.md` 中是否有当前版本的说明
2. 版本号格式是否正确：`## v1.0.1` 而不是 `## 1.0.1`
3. 检查 `dist/latest.yml` 中是否包含 `releaseNotes` 字段
4. 查看控制台日志（搜索 `[Updater]`）

```bash
# 手动测试发布说明提取
node scripts/extract-release-notes.js
```

### Q4: 如何自定义发布说明样式？

编辑 `src/renderer/src/components/UpdateNotification.vue`：

```vue
<style scoped>
.release-notes :deep(h2) {
  /* 自定义二级标题样式 */
  font-size: 1rem;
  color: #1a73e8;
}

.release-notes :deep(li) {
  /* 自定义列表项样式 */
  padding-left: 0.5rem;
}
</style>
```

## 技术实现

### 文件说明

1. **RELEASE_NOTES.md** - 所有版本的发布说明源文件
2. **scripts/extract-release-notes.js** - 提取脚本（构建时自动调用）
3. **electron-builder.yml** - 配置自动读取发布说明
4. **src/main/updater.ts** - 读取并传递发布说明
5. **src/renderer/src/components/UpdateNotification.vue** - 显示发布说明UI

### 数据流

```
RELEASE_NOTES.md
  ↓ (构建时)
extract-release-notes.js 提取当前版本说明
  ↓
写入 dist/latest.yml
  ↓
上传到更新服务器
  ↓
客户端检查更新
  ↓
autoUpdater 读取 latest.yml
  ↓
主进程 → IPC → 渲染进程
  ↓
UpdateNotification 组件显示
```

## 最佳实践

1. **及时更新发布说明**：在开发新功能的同时更新 RELEASE_NOTES.md
2. **简洁明了**：每条说明控制在一行以内
3. **使用 emoji**：让发布说明更直观（✨新功能 🐛修复 ⚡优化 🎨改进）
4. **分类清晰**：新增功能、优化改进、问题修复分开写
5. **版本归档**：保留历史版本说明，方便回溯

## 示例模板

复制以下模板快速创建新版本发布说明：

```markdown
## vX.Y.Z (YYYY-MM-DD)

### 新增功能
- ✨ 

### 优化改进
- 🎨 
- ⚡ 
- 💾 

### 问题修复
- 🐛 

### 已知问题
- ⚠️ 
```

## 相关文档

- [AUTO-UPDATE.md](AUTO-UPDATE.md) - 自动更新完整说明
- [LOCAL-UPDATE-GUIDE.md](LOCAL-UPDATE-GUIDE.md) - 本地测试指南
- [RELEASE_NOTES.md](RELEASE_NOTES.md) - 发布说明源文件
