#!/bin/bash

# 本地发布脚本 - 将构建产物复制到本地 Nginx 目录
# 用于本地测试自动更新功能

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 配置
DIST_DIR="./dist"
TARGET_DIR="/opt/homebrew/var/www/svn/auto-updates"
NGINX_URL="http://localhost:8888/auto-updates"

print_info "开始本地发布流程..."
echo ""

# 检查 dist 目录是否存在
if [ ! -d "$DIST_DIR" ]; then
    print_error "dist 目录不存在，请先运行 npm run build:win"
    exit 1
fi

# 检查目标目录是否存在
if [ ! -d "$TARGET_DIR" ]; then
    print_warning "目标目录不存在，正在创建: $TARGET_DIR"
    mkdir -p "$TARGET_DIR"
    print_success "目录创建成功"
fi

# 清理旧版本文件
print_info "正在清理旧版本文件..."
OLD_FILES=$(find "$TARGET_DIR" -name "*-setup.exe" -o -name "*.exe.blockmap" 2>/dev/null || true)
if [ -n "$OLD_FILES" ]; then
    echo "$OLD_FILES" | while read -r file; do
        if [ -f "$file" ]; then
            rm -f "$file"
            print_success "已删除 $(basename "$file")"
        fi
    done
else
    print_info "无旧文件需要清理"
fi
echo ""

# 查找需要复制的文件
LATEST_YML=$(find "$DIST_DIR" -name "latest.yml" -type f | head -n 1)
SETUP_EXE=$(find "$DIST_DIR" -name "*-setup.exe" -type f | head -n 1)
BLOCKMAP=$(find "$DIST_DIR" -name "*.exe.blockmap" -type f | head -n 1)

# 检查文件是否存在
if [ -z "$LATEST_YML" ]; then
    print_error "未找到 latest.yml 文件"
    exit 1
fi

if [ -z "$SETUP_EXE" ]; then
    print_error "未找到 setup.exe 文件"
    exit 1
fi

print_info "找到以下文件："
echo "  - $(basename "$LATEST_YML")"
echo "  - $(basename "$SETUP_EXE")"
if [ -n "$BLOCKMAP" ]; then
    echo "  - $(basename "$BLOCKMAP")"
fi
echo ""

# 复制文件
print_info "正在复制文件到: $TARGET_DIR"

cp "$LATEST_YML" "$TARGET_DIR/"
print_success "已复制 $(basename "$LATEST_YML")"

# 修复 latest.yml 中 releaseNotes 占位内容，注入真实发布说明
TARGET_LATEST_YML="$TARGET_DIR/$(basename "$LATEST_YML")"
if [ -f "$TARGET_LATEST_YML" ]; then
    node ./scripts/inject-release-notes.js "$TARGET_LATEST_YML"
    print_success "已写入 releaseNotes 到 $(basename "$TARGET_LATEST_YML")"
fi

cp "$SETUP_EXE" "$TARGET_DIR/"
print_success "已复制 $(basename "$SETUP_EXE")"

if [ -n "$BLOCKMAP" ]; then
    cp "$BLOCKMAP" "$TARGET_DIR/"
    print_success "已复制 $(basename "$BLOCKMAP")"
fi

echo ""
print_success "🎉 本地发布完成！"
echo ""

# 显示文件列表
print_info "目标目录文件列表："
ls -lh "$TARGET_DIR" | grep -E '\.(yml|exe|blockmap)$' || true
echo ""

# 显示访问地址
print_info "更新服务器地址:"
echo "  $NGINX_URL"
echo ""
print_info "验证更新文件:"
echo "  curl $NGINX_URL/latest.yml"
echo ""

# 提示下一步操作
print_warning "提示："
echo "  1. 确保 Nginx 正在运行"
echo "  2. 访问 $NGINX_URL 验证文件可访问"
echo "  3. 运行打包后的应用测试自动更新"
echo ""
