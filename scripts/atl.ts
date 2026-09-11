#!/usr/bin/env bun

/**
 * Local atmn: nightly's CLI, named `atmn`, run from a gitignored workspace so
 * a scaffolded autumn.config.ts resolves `from "atmn"` to nightly — not the
 * v1 package at packages/atmn.
 */

import { existsSync } from "node:fs";
import { mkdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "bun";

const repoRoot = resolve(import.meta.dirname, "..");
const workspace = join(repoRoot, "atmn");
const nightly = join(repoRoot, "packages/atmn-nightly");

await mkdir(join(workspace, "node_modules"), { recursive: true });
const link = join(workspace, "node_modules/atmn");
if (!existsSync(link)) {
	await symlink(nightly, link);
}

if (!existsSync(join(workspace, "package.json"))) {
	await Bun.write(
		join(workspace, "package.json"),
		`${JSON.stringify({ name: "atmn-workspace", private: true, type: "module" }, null, "\t")}\n`,
	);
}

const args = process.argv.slice(2);
const forwarded = args[0] === "--" ? args.slice(1) : args;

const child = spawn({
	cmd: ["bun", join(nightly, "src/cli.ts"), ...forwarded],
	cwd: workspace,
	env: {
		...process.env,
		ATMN_CONFIG_PACKAGE: "atmn",
	},
	stdin: "inherit",
	stdout: "inherit",
	stderr: "inherit",
});

process.exit(await child.exited);
