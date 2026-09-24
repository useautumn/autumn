#!/usr/bin/env bun

/**
 * Local atmn runs from a gitignored workspace using the workspace CLI.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "bun";

const repoRoot = resolve(import.meta.dirname, "..");
const workspace = join(repoRoot, "atmn");
const cli = join(repoRoot, "packages/atmn");

await mkdir(join(workspace, "node_modules"), { recursive: true });
const link = join(workspace, "node_modules/atmn");
const linkedCli = await readlink(link).catch((error: NodeJS.ErrnoException) => {
	if (error.code === "ENOENT") return null;
	throw error;
});
if (linkedCli !== cli) {
	if (linkedCli !== null) await unlink(link);
	await symlink(cli, link);
}

if (!existsSync(join(workspace, "package.json"))) {
	await Bun.write(
		join(workspace, "package.json"),
		`${JSON.stringify({ name: "atmn-workspace", private: true, type: "module" }, null, "\t")}\n`,
	);
}

const args = process.argv.slice(2);
const toWorktree = args[0] === "--local-server";
const rest = toWorktree ? args.slice(1) : args;
const forwarded = rest[0] === "--" ? rest.slice(1) : rest;

const worktreeServerUrl = (): string => {
	try {
		const match = readFileSync(
			join(repoRoot, "server/.env.local"),
			"utf8",
		).match(/^AUTUMN_TEST_BASE_URL=(.+)$/m);
		if (match?.[1]?.trim()) return match[1].trim();
	} catch {
		// fall through
	}
	return "http://localhost:8080";
};

const cmd = toWorktree
	? [
			"bun",
			join(cli, "src/cli.ts"),
			"-c",
			".",
			"--base-url",
			worktreeServerUrl(),
			...forwarded,
		]
	: ["bun", join(cli, "src/cli.ts"), "-c", ".", ...forwarded];

const child = spawn({
	cmd,
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
