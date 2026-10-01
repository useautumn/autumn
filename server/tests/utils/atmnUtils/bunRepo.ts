import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_PACKAGE_DIR } from "./initAtmnScenario.js";

/**
 * The CLI packed as a tarball, for `ATMN_INIT_DEPENDENCY`: a `file:` folder
 * dependency leaves atmn's `catalog:` devDependency unresolvable under bun.
 */
export const packAtmnCli = (): string => {
	const tarball = join(mkdtempSync(join(tmpdir(), "atmn-pack-")), "atmn.tgz");
	const packed = Bun.spawnSync(
		["bun", "pm", "pack", "--ignore-scripts", "--quiet", "--filename", tarball],
		{ cwd: CLI_PACKAGE_DIR, stdout: "pipe", stderr: "pipe" },
	);
	if (packed.exitCode !== 0)
		throw new Error(
			`${packed.stdout.toString()}${packed.stderr.toString()}`.trim(),
		);
	return tarball;
};

/** An empty bun.lock, so init installs with bun: bun deletes the lockfile it
 * would write for a package.json with no dependencies. */
export const writeBunLockfile = ({
	root,
	name,
}: {
	root: string;
	name: string;
}): void => {
	writeFileSync(
		join(root, "bun.lock"),
		`${JSON.stringify(
			{
				lockfileVersion: 1,
				configVersion: 1,
				workspaces: { "": { name } },
				packages: {},
			},
			null,
			2,
		)}\n`,
	);
};
