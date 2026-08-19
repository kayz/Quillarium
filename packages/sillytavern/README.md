# @quillarium/sillytavern

`@quillarium/sillytavern` converts between Quillarium documents and the supported SillyTavern
Character Card and World Info formats. All operations are local and deterministic.

## Primary APIs

- Parse: `parseCharacterCardJson`, `parseCharacterCardPng`, `hasPngSignature`, and
  `extractCharacterCardJsonFromPng`.
- Import: `importCharacterCard`, `importCharacterCardJson`, and `importCharacterCardPng`.
- Character export: `exportCharacterCardV2`, `exportCharacterCardV2Json`, and
  `writeCharacterCardV2File`.
- Lorebook export: `exportWorldInfo`, `exportWorldInfoJson`, and `writeWorldInfoFile`.
- Book-card interchange: `importBookCharacterCardIntoProject`, `exportBookCharacterCardV3`, and
  `writeBookCharacterCardV3Png` implement the independent CCv3 novel-setting flow.
- CCv2/CCv3 card, parsed-card, import/write-result, PNG-keyword, and World Info types are public.

## Minimal Example

```ts
import { importCharacterCard, writeWorldInfoFile } from '@quillarium/sillytavern'

const projectRoot = './writing-workspace/projects/my-novel'
const imported = await importCharacterCard(projectRoot, './cards/hero.png')
console.log(imported.characterId, imported.rawPath)

const lorebook = await writeWorldInfoFile(projectRoot)
console.log(lorebook.entryCount, lorebook.outputPath)
```

Card import accepts CCv2 or CCv3 JSON and PNG `ccv3`/`chara` text metadata, creates a Quillarium
character, and retains the original JSON under `sillytavern/`. Character export writes stable CCv2
JSON to `sillytavern/<character-id>-card-v2.json`. Quillarium-native character constraints are stored
under the versioned `extensions.quillarium` namespace and restored on re-import. Canon and
world-entry export writes `sillytavern/quillarium-world-info.json`.

Book-card import preflights every candidate stable ID before taking the project write lock. Applying
an import records before-images and created paths, then restores the configuration and removes only
transaction-created files on failure. Desktop welcome-screen import builds a marked temporary project
under the workspace `projects_dir`, validates the cover, archive hash, candidate settings, and empty
story structure, atomically renames it, and registers the manifest last. Export sanitizes the
allowlisted setting payload and scans the final serialized card before embedding it in PNG.

## Boundaries and Tests

The package has no network client. Its tests create in-memory or temporary JSON/PNG fixtures and can
run offline:

```bash
pnpm exec vitest run packages/sillytavern/src
```

CHARX archives are unsupported. General character import does not materialize embedded assets and
general character export remains CCv2 JSON; the separate book-card flow produces CCv3 PNG. The PNG
helper extracts card metadata; it is not a general PNG decoder and does not validate chunk CRC values.
