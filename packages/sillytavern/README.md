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
- CCv2/CCv3 card, parsed-card, import/write-result, PNG-keyword, and World Info types are public.

## Minimal Example

```ts
import { importCharacterCard, writeWorldInfoFile } from '@quillarium/sillytavern'

const projectRoot = './local-vaults/novels/My Novel'
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

## Boundaries and Tests

The package has no network client. Its tests create in-memory or temporary JSON/PNG fixtures and can
run offline:

```bash
pnpm exec vitest run packages/sillytavern/src
```

CHARX archives are unsupported. CCv3 can be imported, but embedded assets are not materialized and
character export is CCv2 JSON only. The PNG helper extracts card metadata; it is not a general PNG
decoder and does not validate chunk CRC values.
