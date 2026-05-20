import { existsSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { fatal, log } from "../dw/helpers/shell.ts";
import { getCurrentWorktree } from "../dw/helpers/git.ts";
import { loadRegistry } from "../dw/helpers/registry.ts";
import {
	killOwnPorts,
	aliasesFor,
	elasticMqPortFor,
} from "../dw/helpers/ports.ts";
import { killTmuxSession, tmuxSessionName } from "../dw/helpers/tmux.ts";
import { ENV_LOCAL_TARGETS } from "../dw/constants.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, "../..");
const STASH_SUFFIX = ".pw-stash";

/* ------------------------------------------------------------------ */
//  Stash / restore .env.local files
/* ------------------------------------------------------------------ */

const stashedThisRun: string[] = [];

function stashEnvLocalFiles(): void {
	for (const rel of ENV_LOCAL_TARGETS) {
		const abs = join(PROJECT_ROOT, rel);
		const backup = abs + STASH_SUFFIX;
		if (!existsSync(abs)) continue;
		if (existsSync(backup)) {
			log(
				`warning: ${rel}${STASH_SUFFIX} already exists (previous pw run crashed?), skipping stash`,
			);
			continue;
		}
		renameSync(abs, backup);
		stashedThisRun.push(abs);
		log(`stashed ${rel} → ${rel}${STASH_SUFFIX}`);
	}
}

function restoreEnvLocalFiles(): void {
	for (const abs of stashedThisRun) {
		const backup = abs + STASH_SUFFIX;
		if (!existsSync(backup)) continue;
		renameSync(backup, abs);
		log(`restored ${basename(abs)}`);
	}
}

/* ------------------------------------------------------------------ */
//  Commands
/* ------------------------------------------------------------------ */

async function cmdRun(): Promise<void> {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry) {
		fatal(`no registered worktree at ${cwd}. Run 'bun dw setup' first.`);
	}

	const { worktreeNum } = entry;

	// Clean up any lingering dw dev server / tmux session on these ports.
	killOwnPorts(worktreeNum);
	killTmuxSession(tmuxSessionName(worktreeNum));

	// Temporarily hide .env.local files so preload-env.ts can't override
	// Infisical-injected prod secrets with dev Neon branch URLs.
	stashEnvLocalFiles();

	const offset = (worktreeNum - 1) * 100;
	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
		SERVER_PORT: String(8080 + offset),
		VITE_PORT: String(3000 + offset),
		CHECKOUT_PORT: String(3001 + offset),
	};

	if (worktreeNum > 1) {
		const aliases = aliasesFor(worktreeNum);
		env.BETTER_AUTH_URL = aliases.apiUrl;
		env.CLIENT_URL = aliases.viteUrl;
		env.VITE_BACKEND_URL = aliases.apiUrl;
		env.VITE_FRONTEND_URL = aliases.viteUrl;
		const mqPort = elasticMqPortFor(worktreeNum);
		env.SQS_QUEUE_URL_V2 = `http://localhost:${mqPort}/000000000000/autumn.fifo`;
		env.TRACK_SQS_QUEUE_URL = `http://localhost:${mqPort}/000000000000/autumn-track.fifo`;
	}

	const portlessCa = join(homedir(), ".portless", "ca.pem");
	if (existsSync(portlessCa) && !env.NODE_EXTRA_CA_CERTS) {
		env.NODE_EXTRA_CA_CERTS = portlessCa;
	}

	log(`starting dev with prod env (worktree=${worktreeNum})`);

	const proc = Bun.spawn(
		[
			"bun",
			"scripts/dev.ts",
			"--worktree",
			String(worktreeNum),
			...process.argv.slice(3),
		],
		{
			cwd: PROJECT_ROOT,
			env,
			stdout: "inherit",
			stderr: "inherit",
		},
	);

	const cleanupAndExit = (code: number | null) => {
		restoreEnvLocalFiles();
		process.exit(code ?? 0);
	};

	process.on("SIGINT", () => proc.kill("SIGINT"));
	process.on("SIGTERM", () => proc.kill("SIGTERM"));

	// Ensure restore runs even if the child exits on its own.
	proc.exited.then(cleanupAndExit);
}

function cmdIdentify(): void {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry) {
		console.error(`[pw] no registered worktree at ${cwd}`);
		console.error(`     run 'bun dw setup' here first`);
		process.exit(1);
	}

	const { worktreeNum, branchName } = entry;
	const offset = (worktreeNum - 1) * 100;
	const serverPort = 8080 + offset;
	const vitePort = 3000 + offset;
	const [serverUrl, viteUrl] =
		worktreeNum === 1
			? [
					`http://localhost:${serverPort}`,
					`http://localhost:${vitePort}`,
				]
			: [
					aliasesFor(worktreeNum).apiUrl,
					aliasesFor(worktreeNum).viteUrl,
				];

	console.log(`Worktree #${worktreeNum}  (${entry.path})`);
	console.log(`  Branch:        ${branchName ?? "(canonical)"}`);
	console.log(`  Server URL:    ${serverUrl}`);
	console.log(`  Vite URL:      ${viteUrl}`);
	console.log(`  Server port:   ${serverPort}`);
	console.log(`  Vite port:     ${vitePort}`);
	console.log();
	console.log(`PW_WORKTREE_NUM=${worktreeNum}`);
	console.log(`PW_SERVER_URL=${serverUrl}`);
	console.log(`PW_VITE_URL=${viteUrl}`);
	console.log(`PW_SERVER_PORT=${serverPort}`);
	console.log(`PW_VITE_PORT=${vitePort}`);
}

function cmdRestore(): void {
	let restored = 0;
	for (const rel of ENV_LOCAL_TARGETS) {
		const abs = join(PROJECT_ROOT, rel);
		const backup = abs + STASH_SUFFIX;
		if (!existsSync(backup)) continue;
		renameSync(backup, abs);
		log(`restored ${rel}`);
		restored++;
	}
	if (restored === 0) {
		log("no stashed .env.local files found");
	}
}

/* ------------------------------------------------------------------ */
//  Main
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
	const sub = process.argv[2];
	if (!sub || sub === "run") {
		await cmdRun();
		return;
	}
	switch (sub) {
		case "identify":
			cmdIdentify();
			break;
		case "restore":
			cmdRestore();
			break;
		default:
			fatal(
				`unknown subcommand: ${sub} (use: run | identify | restore)`,
			);
	}
}

await main();
