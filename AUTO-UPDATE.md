# 自动更新功能说明

## 功能概述

本应用已集成 `electron-updater` 自动更新功能，**仅在 Windows 平台的打包版本中启用**。macOS 平台暂不支持自动更新。

## 功能特性

- ✅ 启动时自动检查更新（延迟 3 秒）
- ✅ 手动检查更新按钮（侧边栏底部）
- ✅ 更新通知弹窗（右下角）
- ✅ 下载进度显示
- ✅ 用户确认后重启安装
- ✅ 仅在 Windows 生产环境启用

## 工作流程

1. **检查更新**：应用启动 3 秒后自动检查，或点击侧边栏"检查更新"按钮
2. **发现新版本**：右下角弹出通知，显示新版本号
3. **下载更新**：用户点击"立即下载"，显示下载进度
4. **安装更新**：下载完成后点击"重启安装"，应用退出并安装新版本

## 服务端配置

### 1. 准备更新服务器

需要一个可公网访问的静态文件服务器（推荐使用 Nginx）。

**目录结构示例**：
```
/var/www/updates/win/
├── latest.yml                            # 更新元数据（必须）
├── svn-merge-util-1.0.1-setup.exe       # 安装包（必须）
└── svn-merge-util-1.0.1-setup.exe.blockmap  # 差分更新文件（可选）
```

**`latest.yml` 示例内容**（由 electron-builder 自动生成）：
```yaml
version: 1.0.1
files:
  - url: svn-merge-util-1.0.1-setup.exe
    sha512: <长哈希值>
    size: 123456789
path: svn-merge-util-1.0.1-setup.exe
sha512: <长哈希值>
releaseDate: '2026-03-09T10:20:30.000Z'
```

### 2. Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 更新文件目录
    location /updates/win/ {
        alias /var/www/updates/win/;
        
        # 禁用 latest.yml 的缓存（确保客户端总是获取最新信息）
        location ~ latest\.yml$ {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
            add_header Expires "0";
        }
        
        # 安装包和 blockmap 可以长缓存（文件名包含版本号）
        location ~ \.(exe|blockmap)$ {
            add_header Cache-Control "public, max-age=31536000, immutable";
        }
        
        # 允许跨域（可选）
        add_header Access-Control-Allow-Origin "*";
        
        # 自动索引（可选，方便调试）
        autoindex on;
    }
}
```

### 3. 修改配置文件

编辑 `electron-builder.yml`，将 `publish.url` 改为真实地址：

```yaml
publish:
  provider: generic
  url: https://your-domain.com/updates/win  # 修改为实际地址
```

## 发布流程

### 1. 更新版本号

编辑 `package.json`，递增 `version`（例如 `1.0.0` → `1.0.1`）。

```json
{
  "version": "1.0.1"
}
```

### 2. 构建 Windows 版本

```bash
npm run build:win
```

构建产物位于 `dist/` 目录：
- `svn-merge-util-1.0.1-setup.exe`
- `svn-merge-util-1.0.1-setup.exe.blockmap`
- `latest.yml`

### 3. 上传更新文件

将 `dist/` 目录下的以下文件上传到服务器：

```bash
# 方式 1: SCP
scp dist/latest.yml user@your-server:/var/www/updates/win/
scp dist/*-setup.exe user@your-server:/var/www/updates/win/
scp dist/*.blockmap user@your-server:/var/www/updates/win/

# 方式 2: SFTP
sftp user@your-server
put dist/latest.yml /var/www/updates/win/
put dist/*-setup.exe /var/www/updates/win/
put dist/*.blockmap /var/www/updates/win/
```

### 4. 验证更新

访问以下 URL 确认文件可访问：
- `https://your-domain.com/updates/win/latest.yml`
- `https://your-domain.com/updates/win/svn-merge-util-1.0.1-setup.exe`

## 本地测试

### 方式 1: 使用本地 Nginx（推荐）

本项目已配置本地 Nginx 支持，可以直接构建并发布到本地服务器测试。

**配置信息**：
- Nginx URL: `http://localhost:8888/auto-updates`
- 本地目录: `/opt/homebrew/var/www/svn/auto-updates`
- 配置文件: `electron-builder.yml`

**使用步骤**：

1. **验证配置**（首次使用）：
```bash
npm run verify:local
```
此命令会检查：
- 目标目录是否存在
- Nginx 是否运行
- 更新文件是否可访问

2. **构建并发布到本地**：
```bash
# 方式 1: 一键构建+发布
npm run build:win:local

# 方式 2: 分步执行
npm run build:win      # 先构建
npm run publish:local  # 再发布
```

3. **验证更新文件**：
```bash
# 访问更新服务器
open http://localhost:8888/auto-updates

# 检查元数据
curl http://localhost:8888/auto-updates/latest.yml
```

4. **测试自动更新**：
- 运行打包后的应用（在 `dist/` 目录）
- 点击侧边栏"检查更新"按钮
- 应该显示"已是最新版本"（因为本地版本和服务器版本一致）

5. **测试版本升级**：
- 修改 `package.json` 中的 `version`（如 `1.0.0` → `1.0.1`）
- 运行 `npm run build:win:local` 重新构建发布
- 保持旧版本应用运行，点击"检查更新"
- 应该显示发现新版本并可下载安装

**自动发布脚本说明**：

`publish-local.sh` 会自动：
- 查找 `dist/` 目录中的更新文件
- 复制 `latest.yml`、`*-setup.exe`、`*.blockmap` 到 Nginx 目录
- 显示复制结果和访问地址

### 方式 2: 使用临时 HTTP 服务器（备选）

```bash
# 进入 dist 目录
cd dist

# 启动本地服务器（Python 3）
python3 -m http.server 8080

# 或使用 Node.js http-server
npx http-server -p 8080
```

修改 `electron-builder.yml`：
```yaml
publish:
  provider: generic
  url: http://localhost:8080
```

### 方式 2: 使用 dev-app-update.yml

在项目根目录创建 `dev-app-update.yml`：

```yaml
provider: generic
url: http://localhost:8080
```

electron-updater 会优先读取此文件（**不要提交到 Git**）。

## 常见问题

### Q1: 为什么启动后没有检查更新？

**A**: 只有在以下条件同时满足时才会检查：
- 运行平台是 Windows (`process.platform === 'win32'`)
- 应用已打包 (`app.isPackaged === true`)
- 开发模式下不会触发

### Q2: 如何强制触发更新？

**A**: 点击侧边栏底部的"检查更新"按钮。

### Q3: 更新失败怎么办？

**A**: 检查以下几点：
1. 服务器地址是否正确且可访问
2. `latest.yml` 的 `version` 是否大于当前版本
3. 检查浏览器控制台和主进程日志（`[Updater]` 开头）
4. 确认防火墙/杀毒软件没有拦截

### Q4: 如何禁用自动更新？

**A**: 删除或注释 `src/main/index.ts` 中的自动检查代码：

```typescript
// 注释掉这段代码
// setTimeout(() => {
//   checkForUpdates().catch((error) => {
//     console.error('[Main] 自动检查更新失败:', error)
//   })
// }, 3000)
```

### Q5: 是否需要代码签名？

**A**: 不是强制的，但强烈建议：
- 没有签名的安装包会被 Windows SmartScreen 拦截
- 用户需要手动点击"仍然运行"才能安装
- 签名证书可从 Digicert、Sectigo 等机构购买

## 代码签名（可选）

在 `electron-builder.yml` 中添加签名配置：

```yaml
win:
  # ... 其他配置
  certificateFile: path/to/cert.pfx
  certificatePassword: your-password
  # 或使用环境变量
  # certificateFile: ${WIN_CSC_LINK}
  # certificatePassword: ${WIN_CSC_KEY_PASSWORD}
```

签名后的安装包会显示发布者信息，增强用户信任。

## 技术实现

### 主要模块

1. **主进程** (`src/main/updater.ts`)
   - 初始化 `autoUpdater`
   - 监听更新事件
   - 通过 IPC 通知渲染进程

2. **Preload** (`src/preload/index.ts`)
   - 暴露更新 API：`window.updater`
   - 提供类型定义

3. **渲染进程** (`src/renderer/src/components/UpdateNotification.vue`)
   - 显示更新通知
   - 处理用户交互

### IPC 通道

| 通道名称 | 方向 | 说明 |
|---------|------|------|
| `update:check` | 渲染 → 主 | 检查更新 |
| `update:download` | 渲染 → 主 | 下载更新 |
| `update:install` | 渲染 → 主 | 安装更新并重启 |
| `update:status` | 主 → 渲染 | 更新状态通知 |

### 更新状态机

```
idle → checking → available → downloading → downloaded → install
                    ↓               ↓
              not-available      error
```

## 参考资料

- [electron-updater 官方文档](https://www.electron.build/auto-update)
- [electron-builder 发布配置](https://www.electron.build/configuration/publish)
- [Generic Provider 说明](https://www.electron.build/configuration/publish#generic-provider)

## 支持

如有问题，请查看控制台日志（搜索 `[Updater]` 关键字）。
