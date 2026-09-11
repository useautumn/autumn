import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ATMN_DIR } from "./workspacePaths.ts";

/**
 * Nightly lives at `node_modules/atmn` so configs `from "atmn"` resolve, and
 * `atmn` on PATH is nightly talking to the local server. ATMN_CONFIG_PACKAGE
 * keeps a first `atmn pull` from writing `from "atmn-nightly"`.
 */
export const linkAtmn = async ({
	dir,
	backendUrl,
}: {
	dir: string;
	backendUrl: string;
}): Promise<void> => {
	await mkdir(join(dir, "node_modules/.bin"), { recursive: true });
	await symlink(ATMN_DIR, join(dir, "node_modules/atmn"));
	const atmnBin = join(dir, "node_modules/.bin/atmn");
	await writeFile(
		atmnBin,
		`#!/bin/bash
export AUTUMN_BASE_URL="${backendUrl}"
export ATMN_CONFIG_PACKAGE=atmn
exec bun "${join(ATMN_DIR, "src/cli.ts")}" --local "$@"
`,
	);
	await chmod(atmnBin, 0o755);
};
