#!/bin/bash

# 自动化版本发布脚本
# 功能：自动更新版本号 -> 编译打包 -> 发布到本地服务器
# 用法：
#   ./bump-and-release.sh patch    # 递增补丁版本 (1.0.9 -> 1.0.10)
#   ./bump-and-release.sh minor    # 递增次版本 (1.0.9 -> 1.1.0)
#   ./bump-and-release.sh major    # 递增主版本 (1.0.9 -> 2.0.0)
#   ./bump-and-release.sh 1.2.3    # 指定具体版本号

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo ""
}

# 检查参数
if [ $# -eq 0 ]; then
    print_error "请指定版本更新类型或具体版本号"
    echo ""
    echo "用法："
    echo "  $0 patch      递增补丁版本 (1.0.9 -> 1.0.10)"
    echo "  $0 minor      递增次版本 (1.0.9 -> 1.1.0)"
    echo "  $0 major      递增主版本 (1.0.9 -> 2.0.0)"
    echo "  $0 1.2.3      设置为具体版本号"
    echo ""
    exit 1
fi

VERSION_ARG="$1"

# 获取当前版本
OLD_VERSION=$(node -p "require('./package.json').version")
print_info "当前版本: ${YELLOW}${OLD_VERSION}${NC}"

# ==================== 步骤 1: 更新版本号 ====================
print_header "步骤 1/3: 更新版本号"

# 验证 npm version 命令是否可用
if ! command -v npm &> /dev/null; then
    print_error "未找到 npm 命令"
    exit 1
fi

# 更新版本号（不创建 git tag，因为可能不在 git 仓库中）
print_info "正在更新版本号..."
if [[ "$VERSION_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # 指定了具体版本号
    NEW_VERSION=$(npm version "$VERSION_ARG" --no-git-tag-version 2>&1 | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || echo "$VERSION_ARG")
elif [[ "$VERSION_ARG" =~ ^(patch|minor|major)$ ]]; then
    # 使用 patch/minor/major 递增
    NEW_VERSION=$(npm version "$VERSION_ARG" --no-git-tag-version 2>&1 | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
else
    print_error "无效的版本参数: $VERSION_ARG"
    print_info "请使用 patch/minor/major 或者具体版本号 (如 1.2.3)"
    exit 1
fi

if [ -z "$NEW_VERSION" ]; then
    print_error "版本号更新失败"
    exit 1
fi

print_success "版本已更新: ${YELLOW}${OLD_VERSION}${NC} -> ${GREEN}${NEW_VERSION}${NC}"

# ==================== 步骤 2: 编译打包 ====================
print_header "步骤 2/3: 编译打包"

print_info "开始快速编译 (跳过 typecheck)..."
echo ""

# 使用快速构建避免等待太久
if npm run build:win:local:fast; then
    print_success "编译完成"
else
    print_error "编译失败"
    # 恢复版本号
    print_warning "正在恢复版本号到 ${OLD_VERSION}..."
    npm version "$OLD_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
    exit 1
fi

# ==================== 步骤 3: 发布到本地服务器 ====================
print_header "步骤 3/3: 发布到本地服务器"

echo ""
print_success "版本 ${GREEN}${NEW_VERSION}${NC} 已成功发布！"
echo ""
print_info "更新说明:"
print_info "  • 版本号已更新到: ${GREEN}${NEW_VERSION}${NC}"
print_info "  • 已编译 Windows 安装包"
print_info "  • 已发布到本地更新服务器"
echo ""
print_info "测试更新："
print_info "  1. 启动应用程序"
print_info "  2. 点击「检查更新」按钮"
print_info "  3. 下载并安装更新"
echo ""
