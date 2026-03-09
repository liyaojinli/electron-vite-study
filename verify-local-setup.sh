#!/bin/bash

# 验证本地更新服务器配置
# 检查 Nginx 是否运行以及更新文件是否可访问

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
NGINX_URL="http://localhost:8888/auto-updates"
TARGET_DIR="/opt/homebrew/var/www/svn/auto-updates"

echo ""
print_info "验证本地更新服务器配置..."
echo ""

# 1. 检查目标目录是否存在
print_info "检查目标目录: $TARGET_DIR"
if [ -d "$TARGET_DIR" ]; then
    print_success "目录存在"
    
    # 列出文件
    file_count=$(ls -1 "$TARGET_DIR" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$file_count" -gt 0 ]; then
        print_info "目录中的文件:"
        ls -lh "$TARGET_DIR"
    else
        print_warning "目录为空，需要先运行 npm run build:win:local"
    fi
else
    print_warning "目录不存在，将在首次发布时自动创建"
fi
echo ""

# 2. 检查 Nginx 是否运行
print_info "检查 Nginx 是否运行..."
if curl -s --head --fail "$NGINX_URL/" > /dev/null 2>&1; then
    print_success "Nginx 正在运行"
else
    print_error "无法访问 $NGINX_URL"
    print_warning "请确保 Nginx 已启动："
    echo "  brew services start nginx"
    echo "  # 或"
    echo "  nginx"
    exit 1
fi
echo ""

# 3. 检查 latest.yml 是否可访问
print_info "检查更新元数据文件..."
if curl -s --head --fail "$NGINX_URL/latest.yml" > /dev/null 2>&1; then
    print_success "latest.yml 可访问"
    echo ""
    print_info "latest.yml 内容:"
    curl -s "$NGINX_URL/latest.yml"
    echo ""
else
    print_warning "latest.yml 不可访问"
    print_info "这是正常的，如果还未发布任何版本"
fi

# 4. 检查 .exe 文件
print_info "检查安装包文件..."
SETUP_FILES=$(curl -s "$NGINX_URL/" 2>/dev/null | grep -o 'href="[^"]*-setup\.exe"' | sed 's/href="//;s/"//' || echo "")
if [ -n "$SETUP_FILES" ]; then
    print_success "找到安装包文件"
    echo "$SETUP_FILES" | while read -r file; do
        echo "  - $file"
    done
else
    print_warning "未找到安装包文件"
    print_info "这是正常的，如果还未发布任何版本"
fi
echo ""

# 5. 显示下一步操作
print_success "验证完成！"
echo ""
print_info "下一步操作："
echo "  1. 构建并发布到本地:"
echo "     npm run build:win:local"
echo ""
echo "  2. 或者只发布已有的构建:"
echo "     npm run publish:local"
echo ""
echo "  3. 访问更新服务器:"
echo "     open $NGINX_URL"
echo ""
