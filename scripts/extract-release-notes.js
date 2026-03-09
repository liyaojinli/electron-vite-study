#!/usr/bin/env node

/**
 * 从 RELEASE_NOTES.md 提取当前版本的发布说明
 * 在构建时由 electron-builder 自动调用
 */

const fs = require('fs')
const path = require('path')

// 读取 package.json 获取当前版本
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const currentVersion = packageJson.version

// 读取 RELEASE_NOTES.md
const releaseNotesPath = path.join(__dirname, '../RELEASE_NOTES.md')
if (!fs.existsSync(releaseNotesPath)) {
  console.warn('⚠️ RELEASE_NOTES.md 不存在')
  process.exit(0)
}

const releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8')

// 提取当前版本的发布说明
// 通过定位版本标题下标切片，避免被 ### 子标题或换行差异影响
const headerRegex = /^##\s+v([0-9]+\.[0-9]+\.[0-9]+)\b.*$/gim
const headers = []
let headerMatch

while ((headerMatch = headerRegex.exec(releaseNotes)) !== null) {
  headers.push({
    version: headerMatch[1],
    index: headerMatch.index,
    headerLine: headerMatch[0]
  })
}

const currentHeaderIndex = headers.findIndex((h) => h.version === currentVersion)

if (currentHeaderIndex >= 0) {
  const currentHeader = headers[currentHeaderIndex]
  const nextHeader = headers[currentHeaderIndex + 1]
  const sectionEnd = nextHeader ? nextHeader.index : releaseNotes.length
  const rawSection = releaseNotes.slice(currentHeader.index, sectionEnd).trim()

  // 移除版本标题行，只保留正文
  const notesContent = rawSection
    .replace(currentHeader.headerLine, '')
    .trim()

  if (notesContent) {
    console.log(notesContent)
  }
} else {
  console.warn(`⚠️ 未找到版本 ${currentVersion} 的发布说明`)
}
