import path from 'node:path'
import type { Command } from 'commander'
import { createStrategy, listDocs, type StrategyDoc } from '@quillarium/core'

export function registerStrategyCommands(
  program: Command,
  projectOption: (command: Command) => Command
): void {
  const strategy = program.command('strategy').description('Manage narrative and style strategies')
  projectOption(
    strategy
      .command('add')
      .argument('<title>', 'Strategy title')
      .option(
        '--category <category>',
        'narrative | style | pacing | reader_expectation | genre_boundary | other',
        'narrative'
      )
      .option('--scope <scope>', 'Strategy scope', 'project')
      .option('--principle <text...>', 'Principles the writing should follow')
      .option('--avoid <text...>', 'Patterns the writing should avoid')
      .option('--content <text>', 'Strategy notes', '')
      .description('Add a writing strategy')
  ).action(async (title, options) => {
    const file = await createStrategy(
      path.resolve(options.project),
      title,
      {
        category: options.category,
        scope: options.scope,
        principles: options.principle ?? [],
        avoid: options.avoid ?? []
      },
      options.content
    )
    console.log(path.resolve(file))
  })
  projectOption(strategy.command('list').description('List writing strategies')).action(async (options) => {
    const root = path.resolve(options.project)
    for (const document of await listDocs<StrategyDoc>(root, 'strategy')) {
      console.log(
        `${document.data.id}\t${document.data.title}\t${document.data.status}\t${path.relative(root, document.path)}`
      )
    }
  })
}
