#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs')
const path = require('path')

const targetFile = process.argv[2]
if (!targetFile) {
  process.exit(0)
}

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const currentVersion = packageJson.version
const releaseNotesPath = path.join(__dirname, '../RELEASE_NOTES.md')

if (!fs.existsSync(releaseNotesPath) || !fs.existsSync(targetFile)) {
  process.exit(0)
}

const releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8')
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
if (currentHeaderIndex < 0) {
  process.exit(0)
}

const currentHeader = headers[currentHeaderIndex]
const nextHeader = headers[currentHeaderIndex + 1]
const sectionEnd = nextHeader ? nextHeader.index : releaseNotes.length
const rawSection = releaseNotes.slice(currentHeader.index, sectionEnd).trim()
const notesContent = rawSection.replace(currentHeader.headerLine, '').trim()

if (!notesContent) {
  process.exit(0)
}

const content = fs.readFileSync(targetFile, 'utf8')
const lines = content.split(/\r?\n/)
const output = []

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i]
  if (line.startsWith('releaseNotes:')) {
    output.push('releaseNotes: |')
    notesContent.split(/\r?\n/).forEach((noteLine) => {
      output.push(`  ${noteLine}`)
    })

    i += 1
    while (i < lines.length && /^\s+/.test(lines[i])) {
      i += 1
    }
    i -= 1
    continue
  }

  output.push(line)
}

fs.writeFileSync(targetFile, output.join('\n'), 'utf8')
