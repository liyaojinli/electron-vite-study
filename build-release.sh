#!/bin/bash

# SVN批量合并工具 - 构建脚本
# 此脚本会构建 macOS 和 Windows 平台的发布版本

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
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
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""
}

format_bytes() {
    local bytes=${1:-0}
    if [ "$bytes" -lt 1024 ]; then
        echo "${bytes} B"
    elif [ "$bytes" -lt 1048576 ]; then
        awk "BEGIN {printf \"%.2f KB\", ${bytes}/1024}"
    elif [ "$bytes" -lt 1073741824 ]; then
        awk "BEGIN {printf \"%.2f MB\", ${bytes}/1048576}"
    else
        awk "BEGIN {printf \"%.2f GB\", ${bytes}/1073741824}"
    fi
}

get_cache_size_bytes() {
    local total_kb=0
    local cache_dirs=(
        "$HOME/Library/Caches/electron"
        "$HOME/Library/Caches/electron-builder"
    )

    for dir in "${cache_dirs[@]}"; do
        if [ -d "$dir" ]; then
            local dir_kb
            dir_kb=$(du -sk "$dir" 2>/dev/null | awk '{print $1}')
            total_kb=$((total_kb + ${dir_kb:-0}))
        fi
    done

    echo $((total_kb * 1024))
}

run_with_download_monitor() {
    local target_label="$1"
    local cmd="$2"

    print_info "执行命令: ${cmd}"
    print_info "下载监控: 显示缓存增量和瞬时速度（命中缓存时增量可能为 0）"

    local start_bytes
    start_bytes=$(get_cache_size_bytes)
    local prev_bytes=$start_bytes
    local spin='|/-\\'
    local i=0

    bash -lc "$cmd" &
    local cmd_pid=$!

    while kill -0 "$cmd_pid" 2>/dev/null; do
        local now_bytes
        now_bytes=$(get_cache_size_bytes)
        local downloaded=$((now_bytes - start_bytes))
        local speed=$((now_bytes - prev_bytes))
        if [ "$downloaded" -lt 0 ]; then downloaded=0; fi
        if [ "$speed" -lt 0 ]; then speed=0; fi

        printf "\r[%c] %s 下载中: %s | 速度: %s/s" \
            "${spin:i++%${#spin}:1}" \
            "$target_label" \
            "$(format_bytes "$downloaded")" \
            "$(format_bytes "$speed")"

        prev_bytes=$now_bytes
        sleep 1
    done

    wait "$cmd_pid"
    local exit_code=$?

    local end_bytes
    end_bytes=$(get_cache_size_bytes)
    local total_downloaded=$((end_bytes - start_bytes))
    if [ "$total_downloaded" -lt 0 ]; then total_downloaded=0; fi

    printf "\r[✓] %s 下载阶段完成: %s                                \n" \
        "$target_label" \
        "$(format_bytes "$total_downloaded")"

    return "$exit_code"
}

# 检查 Node.js 是否安装
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "未找到 Node.js，请先安装 Node.js"
        exit 1
    fi
    print_success "Node.js 版本: $(node -v)"
}

# 检查 npm 是否安装
check_npm() {
    if ! command -v npm &> /dev/null; then
        print_error "未找到 npm，请先安装 npm"
        exit 1
    fi
    print_success "npm 版本: $(npm -v)"
}

# 清理旧的构建文件
clean_build() {
    print_header "清理旧的构建文件"
    
    if [ -d "dist" ]; then
        print_info "删除 dist 目录..."
        rm -rf dist
        print_success "dist 目录已清理"
    else
        print_info "dist 目录不存在，跳过清理"
    fi
    
    if [ -d "out" ]; then
        print_info "删除 out 目录..."
        rm -rf out
        print_success "out 目录已清理"
    else
        print_info "out 目录不存在，跳过清理"
    fi
}

# 安装依赖
install_deps() {
    print_header "检查依赖"
    
    if [ ! -d "node_modules" ]; then
        print_info "node_modules 不存在，安装依赖..."
        npm install
        print_success "依赖安装完成"
    else
        print_info "node_modules 已存在，跳过安装"
        print_warning "如需重新安装依赖，请先删除 node_modules 目录"
    fi
}

# 类型检查
type_check() {
    print_header "类型检查"
    
    print_info "检查 Node.js 代码类型..."
    npm run typecheck:node
    print_success "Node.js 代码类型检查通过"
    
    print_info "检查 Web 代码类型..."
    npm run typecheck:web
    print_success "Web 代码类型检查通过"
}

# 构建源码
build_source() {
    print_header "构建源码"
    
    print_info "使用 electron-vite 构建项目..."
    npm run build
    print_success "源码构建完成"
}

# 构建 macOS 版本
build_mac() {
    print_header "构建 macOS 应用"
    
    print_info "开始构建 macOS 版本 (x64 + arm64)..."
    print_info "这可能需要几分钟时间..."
    
    run_with_download_monitor "macOS" "npx electron-builder --mac"
    
    print_success "macOS 应用构建完成"
    
    if [ -d "dist" ]; then
        print_info "构建产物:"
        ls -lh dist/*.dmg 2>/dev/null || print_warning "未找到 DMG 文件"
    fi
}

# 构建 Windows 版本
build_win() {
    print_header "构建 Windows 应用"

    if [[ "$OSTYPE" != "msys"* && "$OSTYPE" != "cygwin"* && "$OSTYPE" != "win32"* ]]; then
        print_error "当前环境不是 Windows，无法可靠构建包含 better-sqlite3 的 Windows 安装包"
        print_error "请在 Windows 机器上执行 build-release.bat，或使用 windows-latest CI 构建"
        return 1
    fi
    
    print_info "开始构建 Windows 版本 (x64)..."
    print_info "这可能需要几分钟时间..."
    
    run_with_download_monitor "Windows" "npx electron-builder --win"
    
    print_success "Windows 应用构建完成"
    
    if [ -d "dist" ]; then
        print_info "构建产物:"
        ls -lh dist/*.exe 2>/dev/null || print_warning "未找到 EXE 文件"
    fi
}

# 显示构建结果
show_results() {
    print_header "构建完成"
    
    if [ -d "dist" ]; then
        print_success "所有构建产物已保存到 dist 目录"
        echo ""
        print_info "构建产物列表:"
        echo ""
        ls -lh dist/ | grep -E '\.(dmg|exe)$' || print_warning "未找到安装包文件"
        echo ""
        
        # 计算总大小
        if command -v du &> /dev/null; then
            total_size=$(du -sh dist/ | cut -f1)
            print_info "总大小: $total_size"
        fi
    else
        print_error "dist 目录不存在，构建可能失败"
        exit 1
    fi
}

# 主函数
main() {
    clear
    
    print_header "SVN 批量合并工具 - 构建脚本"
    
    print_info "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # 环境检查
    print_header "环境检查"
    check_node
    check_npm
    
    # 清理
    clean_build
    
    # 安装依赖
    install_deps
    
    # 类型检查
    type_check
    
    # 构建源码
    build_source
    
    # 询问用户要构建哪些平台
    echo ""
    print_info "请选择要构建的平台:"
    echo "  1) macOS"
    echo "  2) Windows"
    echo "  3) macOS + Windows (全部)"
    echo ""
    read -p "请输入选项 (1-3) [默认: 3]: " choice
    choice=${choice:-3}
    
    case $choice in
        1)
            build_mac
            ;;
        2)
            build_win
            ;;
        3)
            build_mac
            build_win
            ;;
        *)
            print_error "无效的选项"
            exit 1
            ;;
    esac
    
    # 显示结果
    show_results
    
    echo ""
    print_info "结束时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    print_success "🎉 构建成功！"
    echo ""
}

# 运行主函数
main
