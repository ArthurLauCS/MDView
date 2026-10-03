/** Run the real packaged executable with only its test entry/dialogs replaced, in a disposable copy. */
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const asar = require('@electron/asar')
const ROOT = path.resolve(__dirname, '..')
const OUT = path.resolve(process.argv[2] || 'design-review/packaged-verification')

async function main() {
  const appDir = path.join(OUT, 'app')
  await fs.cp(path.join(ROOT, 'release/win-unpacked'), appDir, { recursive: true })
  const archive = path.join(appDir, 'resources/app.asar')
  const source = path.join(OUT, 'test-entry')
  asar.extractAll(archive, source)
  const manifestPath = path.join(source, 'package.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.main = './verification.cjs'
  await fs.writeFile(manifestPath, JSON.stringify(manifest))
  await fs.copyFile(path.join(ROOT, 'scripts/export-check.cjs'), path.join(source, 'verification.cjs'))
  await asar.createPackage(source, archive)
  const child = spawn(path.join(appDir, 'MDView.exe'), [], {
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, MDVIEW_CHECK_ROOT: ROOT, MDVIEW_CHECK_OUT: OUT,
      MDVIEW_PACKAGED_ENTRY: path.join(archive, 'out/main/index.js') }
  })
  child.on('error', error => { console.error(error); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
}
main().catch(error => { console.error(error); process.exitCode = 1 })
