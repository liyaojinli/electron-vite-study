# SVN 批量合并工具 - 构建说明

## 快速开始

### macOS / Linux 用户

```bash
# 方式 1: 使用 npm 命令 (推荐)
npm run build:release

# 方式 2: 直接运行脚本
./build-release.sh
```

### Windows 用户

```cmd
# 方式 1: 双击运行
build-release.bat

# 方式 2: 命令行运行
.\build-release.bat
```

## 构建选项

运行构建脚本后，会提示选择构建平台：

1. **仅构建 macOS** - 生成 .dmg 安装包（支持 Intel 和 Apple Silicon）
2. **仅构建 Windows** - 生成 .exe 安装程序（64位）
3. **构建全部平台** - 同时构建 macOS 和 Windows 版本

## 构建产物

构建完成后，所有安装包会保存在 `dist/` 目录：

```
dist/
├── svn-merge-util-1.0.0.dmg          # macOS 安装包（universal，支持 Intel + M1/M2）
├── svn-merge-util-1.0.0-setup.exe    # Windows 安装程序（64位）
└── ...其他临时文件
```

### macOS 安装包说明

- **格式**: DMG 磁盘映像
- **架构**: Universal (x64 + arm64)
  - x64: 支持 Intel 芯片的 Mac
  - arm64: 支持 Apple Silicon (M1/M2/M3) 的 Mac
- **安装**: 双击 .dmg 文件，将应用拖到 Applications 文件夹
- **首次运行**: 右键点击应用 → 选择"打开"（绕过安全设置）

### Windows 安装包说明

- **格式**: NSIS 安装程序
- **架构**: x64 (64位)
- **安装**: 双击 .exe 文件，按照向导完成安装
- **特性**: 
  - 自动创建桌面快捷方式
  - 添加到开始菜单
  - 支持卸载

## 构建流程

构建脚本会自动执行以下步骤：

1. **环境检查** - 验证 Node.js 和 npm 已安装
2. **清理旧文件** - 删除之前的 dist 和 out 目录
3. **安装依赖** - 如果 node_modules 不存在则安装
4. **类型检查** - 检查 TypeScript 代码类型错误
5. **编译源码** - 使用 electron-vite 编译项目
6. **打包应用** - 使用 electron-builder 生成安装包

## 系统要求

### 开发环境要求

- **Node.js**: 18.x 或更高版本
- **npm**: 9.x 或更高版本
- **磁盘空间**: 至少 2GB 可用空间

### 跨平台构建说明

**在 macOS 上**:
- ✅ 可以构建 macOS 版本
- ✅ 可以构建 Windows 版本
- ✅ 可以构建 Linux 版本

**在 Windows 上**:
- ❌ 无法构建 macOS 版本（需要 macOS 系统）
- ✅ 可以构建 Windows 版本
- ✅ 可以构建 Linux 版本（通过 WSL）

**在 Linux 上**:
- ❌ 无法构建 macOS 版本（需要 macOS 系统）
- ✅ 可以构建 Windows 版本
- ✅ 可以构建 Linux 版本

> **提示**: 如需在非 macOS 系统上构建 macOS 应用，需要在 macOS 上进行构建。

## 常见问题

### 1. 构建失败：找不到 electron-builder

```bash
npm install --save-dev electron-builder
```

### 2. macOS 下首次运行提示"已损坏"

这是因为应用未签名。解决方法：

```bash
# 方法 1: 右键打开
右键点击应用 → 选择"打开" → 点击"打开"

# 方法 2: 移除隔离属性
xattr -cr /Applications/SVN批量合并工具.app
```

### 3. Windows 下杀毒软件报警

这是误报，因为应用未签名。可以：
- 添加到杀毒软件白名单
- 获取代码签名证书进行签名

### 4. 构建速度慢

第一次构建会下载 Electron 二进制文件，需要较长时间。后续构建会快很多。

加速方法：
```bash
# 使用淘宝镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

### 5. 构建时内存不足

增加 Node.js 内存限制：
```bash
# Linux/macOS
export NODE_OPTIONS="--max-old-space-size=4096"

# Windows
set NODE_OPTIONS=--max-old-space-size=4096
```

## 高级配置

### 修改应用信息

编辑 `electron-builder.yml`:

```yaml
appId: com.svnmerge.app              # 应用唯一标识
productName: SVN批量合并工具          # 应用显示名称
```

### 修改图标

替换以下文件：
- `resources/icon.icns` - macOS 图标
- `resources/icon.png` - Windows 和 Linux 图标
- `resources/icon.svg` - 源文件（可选）

### 添加代码签名

#### macOS 签名

1. 加入 Apple Developer Program
2. 创建签名证书
3. 更新 `electron-builder.yml`:

```yaml
mac:
  identity: "Developer ID Application: Your Name (TEAM_ID)"
  notarize: true
```

#### Windows 签名

1. 购买代码签名证书
2. 更新 `electron-builder.yml`:

```yaml
win:
  certificateFile: "path/to/cert.pfx"
  certificatePassword: "password"
```

## 自动化构建

### GitHub Actions 示例

创建 `.github/workflows/build.yml`:

```yaml
name: Build Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run build
      
      - name: Package (macOS)
        if: runner.os == 'macOS'
        run: npx electron-builder --mac
      
      - name: Package (Windows)
        if: runner.os == 'Windows'
        run: npx electron-builder --win
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: release-${{ runner.os }}
          path: dist/*.{dmg,exe}
```

## 更新日志

### v1.0.0 (2026-03-07)
- 初始版本
- 支持 macOS 和 Windows 平台
- SVN 批量合并功能
- 日志查看器
- 冲突处理

## 技术支持

如有问题，请联系开发团队或提交 Issue。
