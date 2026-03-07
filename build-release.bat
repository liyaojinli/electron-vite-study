@echo off
REM SVN批量合并工具 - Windows 构建脚本
REM 此脚本会构建 macOS 和 Windows 平台的发布版本

setlocal enabledelayedexpansion

echo.
echo ===============================================================
echo   SVN 批量合并工具 - 构建脚本
echo ===============================================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    exit /b 1
)
echo [成功] Node.js 版本:
node -v

REM 检查 npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 npm，请先安装 npm
    exit /b 1
)
echo [成功] npm 版本:
npm -v

echo.
echo ===============================================================
echo   清理旧的构建文件
echo ===============================================================
echo.

if exist dist (
    echo [信息] 删除 dist 目录...
    rmdir /s /q dist
    echo [成功] dist 目录已清理
) else (
    echo [信息] dist 目录不存在，跳过清理
)

if exist out (
    echo [信息] 删除 out 目录...
    rmdir /s /q out
    echo [成功] out 目录已清理
) else (
    echo [信息] out 目录不存在，跳过清理
)

echo.
echo ===============================================================
echo   检查依赖
echo ===============================================================
echo.

if not exist node_modules (
    echo [信息] node_modules 不存在，安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        exit /b 1
    )
    echo [成功] 依赖安装完成
) else (
    echo [信息] node_modules 已存在，跳过安装
    echo [警告] 如需重新安装依赖，请先删除 node_modules 目录
)

echo.
echo ===============================================================
echo   类型检查
echo ===============================================================
echo.

echo [信息] 检查 Node.js 代码类型...
call npm run typecheck:node
if %errorlevel% neq 0 (
    echo [错误] Node.js 代码类型检查失败
    exit /b 1
)
echo [成功] Node.js 代码类型检查通过

echo [信息] 检查 Web 代码类型...
call npm run typecheck:web
if %errorlevel% neq 0 (
    echo [错误] Web 代码类型检查失败
    exit /b 1
)
echo [成功] Web 代码类型检查通过

echo.
echo ===============================================================
echo   构建源码
echo ===============================================================
echo.

echo [信息] 使用 electron-vite 构建项目...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 源码构建失败
    exit /b 1
)
echo [成功] 源码构建完成

echo.
echo ===============================================================
echo   选择构建平台
echo ===============================================================
echo.
echo 请选择要构建的平台:
echo   1) macOS
echo   2) Windows
echo   3) macOS + Windows (全部)
echo.
set /p choice="请输入选项 (1-3) [默认: 3]: "
if "%choice%"=="" set choice=3

if "%choice%"=="1" goto build_mac
if "%choice%"=="2" goto build_win
if "%choice%"=="3" goto build_all
echo [错误] 无效的选项
exit /b 1

:build_mac
echo.
echo ===============================================================
echo   构建 macOS 应用
echo ===============================================================
echo.
echo [信息] 开始构建 macOS 版本 (x64 + arm64)...
echo [信息] 这可能需要几分钟时间...
call npx electron-builder --mac
if %errorlevel% neq 0 (
    echo [错误] macOS 应用构建失败
    exit /b 1
)
echo [成功] macOS 应用构建完成
goto show_results

:build_win
echo.
echo ===============================================================
echo   构建 Windows 应用
echo ===============================================================
echo.
echo [信息] 开始构建 Windows 版本 (x64)...
echo [信息] 这可能需要几分钟时间...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo [错误] Windows 应用构建失败
    exit /b 1
)
echo [成功] Windows 应用构建完成
goto show_results

:build_all
echo.
echo ===============================================================
echo   构建 macOS 应用
echo ===============================================================
echo.
echo [信息] 开始构建 macOS 版本 (x64 + arm64)...
echo [信息] 这可能需要几分钟时间...
call npx electron-builder --mac
if %errorlevel% neq 0 (
    echo [错误] macOS 应用构建失败
    exit /b 1
)
echo [成功] macOS 应用构建完成

echo.
echo ===============================================================
echo   构建 Windows 应用
echo ===============================================================
echo.
echo [信息] 开始构建 Windows 版本 (x64)...
echo [信息] 这可能需要几分钟时间...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo [错误] Windows 应用构建失败
    exit /b 1
)
echo [成功] Windows 应用构建完成

:show_results
echo.
echo ===============================================================
echo   构建完成
echo ===============================================================
echo.

if exist dist (
    echo [成功] 所有构建产物已保存到 dist 目录
    echo.
    echo [信息] 构建产物列表:
    echo.
    dir /b dist\*.dmg 2>nul
    dir /b dist\*.exe 2>nul
    echo.
) else (
    echo [错误] dist 目录不存在，构建可能失败
    exit /b 1
)

echo.
echo [成功] 构建成功！
echo.
pause
