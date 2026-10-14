import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ATMN_DIR } from "./workspacePaths.ts";

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
exec bun "${join(ATMN_DIR, "src/cli.ts")}" --base-url "${backendUrl}" "$@"
`,
	);
	await chmod(atmnBin, 0o755);
};
