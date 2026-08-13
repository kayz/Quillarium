# Release Process

Quillarium version tags and GitHub Releases are immutable delivery records. Ordinary commits, pull
requests, and merges do not publish a version.

## Candidate requirements

Before creating a version tag:

1. finish the version's implementation and human acceptance checklist;
2. merge the exact candidate into `master` and confirm local `master` equals `origin/master`;
3. set the same semantic version in the root, desktop, and every workspace package manifest;
4. run `pnpm build`, `pnpm test`, `pnpm test:coverage`, `pnpm lint`, `pnpm format:check`,
   `pnpm desktop:build`, and `pnpm audit --prod --audit-level=high`; and
5. confirm the requested tag does not already exist locally, remotely, or as a GitHub Release.

The tag format is `v<package-version>`, for example `v0.2.0-alpha.2`.

## Tag creation

Create and push the tag only from the verified current `master` tip:

```bash
git switch master
git pull --ff-only origin master
git tag v0.2.0-alpha.2
git push origin v0.2.0-alpha.2
```

Pushing the tag authorizes the automated release workflow. Do not create the tag on a feature
branch or an older commit.

## Automated gates

The tag workflow:

1. rejects workflow reruns and verifies the tag resolves to the current remote `master` tip;
2. verifies the tag version matches every package manifest;
3. runs build, test, coverage, lint, format, desktop build, and production dependency audit on Linux;
4. packages Windows x64 on Windows and macOS x64 plus arm64 on macOS;
5. verifies that exactly those three installers were downloaded; and
6. creates one GitHub Release only after every gate succeeds.

A semantic pre-release version such as `0.2.0-alpha.2` is automatically published with GitHub's
Pre-release flag. The workflow never creates, moves, or force-updates a Git tag and never overwrites
an existing Release or asset.

## Failure policy

If any tag workflow fails, preserve that tag and its evidence. Do not move the tag, delete and
recreate it, rerun its workflow, or upload replacement assets. Fix the defect through the normal
development and review flow, choose a new forward-only version, and create a new tag at the then-
current `master` tip.

Installer signing and fresh-machine Windows/macOS acceptance remain human gates. Automated package
success does not prove installation, restart, migration, credential persistence, accessibility, or
real writing-flow usability.
