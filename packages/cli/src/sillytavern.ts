import path from 'node:path'
import type { Command } from 'commander'
import { importCharacterCard, writeCharacterCardV2File, writeWorldInfoFile } from '@quillarium/sillytavern'

export function registerSillyTavernCommands(
  program: Command,
  projectOption: (command: Command) => Command
): void {
  const sillyTavern = program.command('st').description('Import and export SillyTavern data')
  projectOption(
    sillyTavern
      .command('import-card')
      .argument('<file>', 'CCv2/CCv3 JSON or PNG Character Card')
      .description('Import a SillyTavern Character Card')
  ).action(async (file, options) => {
    const result = await importCharacterCard(path.resolve(options.project), path.resolve(file))
    console.log(`format: ${result.format}`)
    console.log(`character: ${path.resolve(result.characterPath)}`)
    console.log(`raw: ${path.resolve(result.rawPath)}`)
  })
  projectOption(
    sillyTavern
      .command('export-card')
      .argument('<character-id>', 'Quillarium character id')
      .description('Export a character as a CCv2 JSON file')
  ).action(async (characterId, options) => {
    const result = await writeCharacterCardV2File(path.resolve(options.project), characterId)
    console.log(`format: ${result.format}`)
    console.log(`output: ${path.resolve(result.outputPath)}`)
  })
  projectOption(
    sillyTavern.command('export-lorebook').description('Export Canon and world entries as World Info JSON')
  ).action(async (options) => {
    const result = await writeWorldInfoFile(path.resolve(options.project))
    console.log(`format: ${result.format}`)
    console.log(`entries: ${result.entryCount}`)
    console.log(`output: ${path.resolve(result.outputPath)}`)
  })
}
