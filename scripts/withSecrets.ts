#!/usr/bin/env bun
// Usage: bun scripts/withSecrets.ts --env=dev -- <command...>
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "bun";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const LOCAL_ENV_PATH = join(REPO_ROOT, "server/.env.local");
const INFISICAL_DIR = join(homedir(), ".infisical");
// The CLI writes this on first invocation, even on machines that never logged in.
const NON_SESSION_FILES = new Set(["migration-notice.json"]);

const fail = ({ message }: { message: string }): never => {
	console.error(`[withSecrets] ${message}`);
	process.exit(1);
};

const parseArgs = ({ argv }: { argv: string[] }) => {
	const separatorIndex = argv.indexOf("--");
	const env = argv
		.slice(0, separatorIndex)
		.find((arg) => arg.startsWith("--env="))
		?.slice("--env=".length);
	const command = argv.slice(separatorIndex + 1);

	if (separatorIndex === -1 || !env || command.length === 0) {
		return fail({ message: "usage: withSecrets.ts --env=<env> -- <command>" });
	}
	return { env, command };
};

// An expired login still leaves config behind, so it counts as set up and fails hard in `infisical run`.
const isInfisicalSetUp = () => {
	if (process.env.INFISICAL_TOKEN || process.env.INFISICAL_CLIENT_ID) {
		return true;
	}
	if (!existsSync(INFISICAL_DIR)) return false;
	return readdirSync(INFISICAL_DIR).some(
		(file) => !NON_SESSION_FILES.has(file),
	);
};

const resolveCommand = ({
	env,
	command,
}: {
	env: string;
	command: string[];
}) => {
	if (isInfisicalSetUp()) {
		return [
			"infisical",
			"run",
			`--env=${env}`,
			"--recursive",
			"--",
			...command,
		];
	}
	if (existsSync(LOCAL_ENV_PATH)) {
		console.error(
			"[withSecrets] Infisical not set up on this machine; using server/.env.local + process.env",
		);
		return command;
	}
	return fail({
		message:
			"Infisical is not set up and server/.env.local is missing. Run `infisical login`.",
	});
};

const proc = spawn(resolveCommand(parseArgs({ argv: process.argv.slice(2) })), {
	stdio: ["inherit", "inherit", "inherit"],
	env: process.env,
});
// Ctrl+C already reaches the child via the process group; re-sending it trips double-SIGINT force-exits.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => proc.kill("SIGTERM"));
process.exit(await proc.exited);
