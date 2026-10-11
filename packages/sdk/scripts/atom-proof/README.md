# Atom proof on a packed autumn-js

`atomProof.ts` checks `atomURL` + `autumn.atom.check` on the tarball users install. It's manual because the build needs more than 8 GB, and its staging half needs secrets.

1. Regenerate the SDK and build it (`bun api`, or for TypeScript only: `speakeasy run -t autumn` in `packages/sdk`, `patchTsSdkHooks`, `assertTsSdkPatches`), then run `bun js:build`.
2. Pack autumn-js the way `npm-publish.yml` does:
   `jq 'del(.devDependencies) | del(.scripts.prepublishOnly)'` on `package.json`, then `npm pack`.
3. In an empty folder, run `npm i <tarball> typescript @types/node`, copy this script in, and run `npx tsc --noEmit` and `node atomProof.ts`.

The script always runs the local stand-in checks and the secret-free staging checks.

The checks that need staging secrets run only when these are set:
- `STAGING_SECRET_KEY`: a staging key for an org registered on the shadow Atom.
- `ATOM_TOKEN`: that org's Atom token. The shadow Atom is multi-tenant, so it opens with `x-atom-token`, not the secret key.
- `CUSTOMER_ID` and `FEATURE_ID`: a customer the Atom holds.

They send read-only checks only (no `sendEvent`).
