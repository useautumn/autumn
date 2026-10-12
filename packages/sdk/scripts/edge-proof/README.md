# Edge proof on a packed autumn-js

`edgeProof.ts` checks `edgeURL`, `autumn.edge.check` and `useEdge` on the tarball users install. It's manual because the autumn-js build needs more than 8 GB, and the staging checks need an edge and a key.

1. Regenerate the SDK: `bun api`, or for TypeScript only, `speakeasy run -t autumn` in `packages/sdk`, then `patchTsSdkHooks` and `assertTsSdkPatches`. Then build with `bun js:build`.
2. Pack autumn-js the way `npm-publish.yml` does: run `jq 'del(.devDependencies) | del(.scripts.prepublishOnly)'` on `package.json`, then `npm pack`.
3. In an empty folder, run `npm i <tarball> typescript @types/node`, copy this script in, then run `npx tsc --noEmit` and `node edgeProof.ts`.

The local checks always run. Set `EDGE_URL` (an org's own edge, which accepts its secret key) to add the staging checks. The checks that need a valid key also need `STAGING_SECRET_KEY`, `CUSTOMER_ID` and `FEATURE_ID`.

Every staging check is a read-only `check`, with no `sendEvent`.

`others/python-sdk/scripts/edge_proof.py` is the Python twin, with the same environment variables.
