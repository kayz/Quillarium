import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(packageRoot, 'src', 'semantic', 'prompts')
const outputDir = path.join(packageRoot, 'dist', 'semantic', 'prompts')

await mkdir(outputDir, { recursive: true })
for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
  if (entry.isFile() && path.extname(entry.name) === '.md') {
    await copyFile(path.join(sourceDir, entry.name), path.join(outputDir, entry.name))
  }
}
