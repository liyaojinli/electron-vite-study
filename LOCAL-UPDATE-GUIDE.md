# 本地自动更新测试指南

## 快速开始

### 1. 验证本地环境

```bash
npm run verify:local
```

这会检查：
- ✅ Nginx 是否运行在 `http://localhost:8888`
- ✅ 目标目录 `/opt/homebrew/var/www/svn/auto-updates` 是否存在
- ✅ 更新文件是否可访问

### 2. 构建并发布到本地

```bash
# 一键完成构建+发布
npm run build:win:local

# 或者分步执行
npm run build:win      # 构建
npm run publish:local  # 发布到本地 Nginx
```

### 3. 测试自动更新流程

#### 场景 1: 首次测试（同版本）

1. 运行 `npm run build:win:local` 构建版本 1.0.0
2. 安装并运行打包后的应用（`dist/svn-merge-util-1.0.0-setup.exe`）
3. 点击侧边栏底部的"检查更新"按钮
4. 应该显示"已是最新版本"

#### 场景 2: 版本升级测试

1. 保持旧版本应用运行（如 1.0.0）
2. 修改 `package.json` 的 `version` 为 `1.0.1`
3. 运行 `npm run build:win:local` 发布新版本
4. 回到运行中的旧版本应用，点击"检查更新"
5. 应该显示发现新版本 v1.0.1
6. 点击"立即下载"，等待下载完成
7. 点击"重启安装"，应用会关闭并自动安装新版本
8. 重新打开应用，版本应该更新为 1.0.1

#### 场景 3: 启动时自动检查

1. 确保已发布新版本到本地服务器
2. 运行旧版本应用
3. 等待 3 秒后，右下角会自动弹出更新通知（如果有新版本）

## 命令说明

| 命令 | 说明 |
|------|------|
| `npm run verify:local` | 验证本地 Nginx 配置 |
| `npm run build:win:local` | 构建 Windows 版本并发布到本地 |
| `npm run publish:local` | 仅发布已构建的文件到本地 |
| `npm run build:win` | 仅构建 Windows 版本（不发布） |

## 配置信息

- **更新服务器**: `http://localhost:8888/auto-updates`
- **本地目录**: `/opt/homebrew/var/www/svn/auto-updates`
- **配置文件**: `electron-builder.yml`

## 文件说明

发布后的文件结构：
```
/opt/homebrew/var/www/svn/auto-updates/
├── latest.yml                              # 更新元数据（必需）
├── svn-merge-util-1.0.0-setup.exe         # 安装包（必需）
└── svn-merge-util-1.0.0-setup.exe.blockmap # 差分更新（可选）
```

## 常见问题

### Q: 验证脚本报错 "无法访问"？

**A**: 确保 Nginx 已启动：
```bash
# 启动 Nginx
brew services start nginx

# 或临时启动
nginx

# 检查状态
brew services list | grep nginx
```

### Q: 更新通知不显示？

**A**: 检查以下几点：
1. 应用是否已打包（开发模式不会检查更新）
2. 版本号是否确实升级了
3. 查看控制台日志（搜索 `[Updater]`）
4. 确认 `latest.yml` 可访问：`curl http://localhost:8888/auto-updates/latest.yml`

### Q: 如何重置测试？

**A**: 删除本地已发布的文件：
```bash
rm -rf /opt/homebrew/var/www/svn/auto-updates/*
```

## 调试技巧

### 查看更新日志

打开开发者工具（应用内按 F12），查看主进程日志：
```
[Updater] 初始化自动更新模块
[Updater] 正在检查更新...
[Updater] 发现新版本: 1.0.1
[Updater] 下载进度: 45%
[Updater] 更新下载完成: 1.0.1
```

### 手动测试更新 API

在应用内打开控制台（F12），执行：
```javascript
// 手动检查更新
await window.updater.checkForUpdates()

// 监听更新状态
const unsubscribe = window.updater.onUpdateStatus((info) => {
  console.log('更新状态:', info)
})
```

### 验证服务器文件

```bash
# 查看目录内容
ls -lh /opt/homebrew/var/www/svn/auto-updates/

# 检查 latest.yml
curl http://localhost:8888/auto-updates/latest.yml

# 测试下载速度
curl -O http://localhost:8888/auto-updates/svn-merge-util-1.0.0-setup.exe
```

## 下一步

本地测试通过后，可以：
1. 将更新服务器部署到生产环境
2. 修改 `electron-builder.yml` 的 `publish.url` 为生产地址
3. 配置代码签名（Windows 证书）
4. 设置 HTTPS 和 CDN 加速

详细信息请查看 [AUTO-UPDATE.md](AUTO-UPDATE.md)。
