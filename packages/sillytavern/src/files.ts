import path from 'node:path'
import { loadProject, slugify, writeText } from '@quillarium/core'
import { SillyTavernFormatError } from './errors.js'
import { exportCharacterCardV2 } from './card.js'
import type { CharacterCardWriteResult, WorldInfoWriteResult } from './types.js'
import { exportWorldInfo } from './world-info.js'

export async function writeCharacterCardV2File(
  projectRoot: string,
  characterId: string
): Promise<CharacterCardWriteResult> {
  const root = path.resolve(projectRoot)
  await loadProject(root)
  const card = await exportCharacterCardV2(root, characterId)
  const outputPath = safeSillyTavernPath(root, `${slugify(characterId)}-card-v2.json`)
  await writeText(outputPath, `${JSON.stringify(card, null, 2)}\n`)
  return { format: 'v2', characterId, outputPath }
}

export async function writeWorldInfoFile(projectRoot: string): Promise<WorldInfoWriteResult> {
  const root = path.resolve(projectRoot)
  await loadProject(root)
  const worldInfo = await exportWorldInfo(root)
  const outputPath = safeSillyTavernPath(root, 'quillarium-world-info.json')
  await writeText(outputPath, `${JSON.stringify(worldInfo, null, 2)}\n`)
  return {
    format: 'world-info',
    entryCount: Object.keys(worldInfo.entries).length,
    outputPath
  }
}

function safeSillyTavernPath(projectRoot: string, fileName: string): string {
  const root = path.resolve(projectRoot)
  const outputDir = path.resolve(root, 'sillytavern')
  const outputPath = path.resolve(outputDir, fileName)
  const relative = path.relative(outputDir, outputPath)
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new SillyTavernFormatError(`Unsafe SillyTavern output path: ${outputPath}`)
  }
  return outputPath
}
