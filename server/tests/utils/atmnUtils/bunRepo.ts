import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_PACKAGE_DIR } from "./initAtmnScenario.js";

export const packAtmnCli = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-pack-"));
	const tarball = join(dir, "atmn.tgz");
	const packed = Bun.spawnSync(
		["bun", "pm", "pack", "--ignore-scripts", "--quiet", "--filename", tarball],
		{ cwd: CLI_PACKAGE_DIR, stdout: "pipe", stderr: "pipe" },
	);
	if (packed.exitCode !== 0) {
		rmSync(dir, { recursive: true, force: true });
		throw new Error(
			`${packed.stdout.toString()}${packed.stderr.toString()}`.trim(),
		);
	}
	return tarball;
};

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
