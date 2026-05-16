import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { stringifyFrontmatter, parseMarkdown } from './yaml.js'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

export async function writeText(filePath: string, text: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await writeFile(filePath, text, 'utf8')
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8')
}

export async function writeMarkdown(filePath: string, data: Record<string, unknown>, content: string): Promise<void> {
  await writeText(filePath, stringifyFrontmatter(data, content))
}

export async function readMarkdown<T extends Record<string, unknown>>(filePath: string): Promise<{ data: T; content: string }> {
  return parseMarkdown<T>(await readText(filePath))
}

export async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = []
  if (!(await pathExists(root))) return out
  async function walk(dir: string) {
    const items = await readdir(dir, { withFileTypes: true })
    for (const item of items) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        await walk(full)
      } else if (item.isFile() && item.name.toLowerCase().endsWith('.md')) {
        out.push(full)
      }
    }
  }
  await walk(root)
  return out
}
