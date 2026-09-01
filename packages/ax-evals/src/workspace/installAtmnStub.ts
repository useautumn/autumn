import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shadows atmn's network verbs with instant deterministic replies so step-tier
 * cases never stall on approval walls or need a live server. Everything else
 * (preview, validate) delegates to the real CLI symlinked in node_modules.
 * `npx atmn` and `atmn` both resolve through node_modules/.bin, so the shim
 * intercepts every route agents actually use.
 */
const STUB = `#!/bin/bash
verb=""
for arg in "$@"; do case "$arg" in -*) ;; *) verb="$arg"; break;; esac; done

case "$verb" in
  pull)
    echo "Nothing to pull — this org has no features or plans yet."
    exit 0;;
  push)
    echo "Push accepted (eval sandbox: applied without contacting the server)."
    exit 0;;
  login)
    echo "Already authenticated — AUTUMN_SECRET_KEY is set in .env."
    exit 0;;
  init)
    echo "Not needed — this project is already set up (atmn installed, key in .env)."
    echo "Write autumn.config.ts directly."
    exit 0;;
  plans|products|features|customers|events)
    echo "Not available in this sandbox — autumn.config.ts is the source of truth here."
    exit 0;;
  env)
    echo "Sandbox environment. Key loaded from .env."
    exit 0;;
  *)
    dir="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
    exec node "$dir/../atmn/dist/cli.js" "$@";;
esac
`;

export const installAtmnStub = async ({
	workspaceDir,
}: {
	workspaceDir: string;
}): Promise<void> => {
	const binDir = join(workspaceDir, "node_modules/.bin");
	await mkdir(binDir, { recursive: true });
	const stubPath = join(binDir, "atmn");
	await writeFile(stubPath, STUB);
	await chmod(stubPath, 0o755);
};
