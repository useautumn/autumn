import { existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
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

async function cmdRun(): Promise<void> {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry) {
		fatal(`no registered worktree at ${cwd}. Run 'bun dw setup' first.`);
	}

	const { worktreeNum } = entry;

	if (process.env.PW_MODE !== "1") {
		fatal(
			"PW_MODE=1 not set. Run via 'bun pw' (package.json script) — required so preload-env.ts skips .env.local.",
		);
	}

	killOwnPorts(worktreeNum);
	killTmuxSession(tmuxSessionName(worktreeNum));

	const offset = (worktreeNum - 1) * 100;
	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
		SERVER_PORT: String(8080 + offset),
		VITE_PORT: String(3000 + offset),
		CHECKOUT_PORT: String(3001 + offset),
		// Empty string overrides dev.ts's `?? "https://google.emulate.localhost"`
		// fallback so real Google OAuth is used against the prod DB.
		EMULATE_GOOGLE_URL: "",
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

	log(`starting dev with prod env (worktree=${worktreeNum}, emulate=disabled)`);

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

	process.on("SIGINT", () => proc.kill("SIGINT"));
	process.on("SIGTERM", () => proc.kill("SIGTERM"));
	await proc.exited.then((c) => process.exit(c ?? 0));
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
			? [`http://localhost:${serverPort}`, `http://localhost:${vitePort}`]
			: [aliasesFor(worktreeNum).apiUrl, aliasesFor(worktreeNum).viteUrl];

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

// Manual cleanup for .pw-stash files left by older buggy pw versions that
// renamed .env.local. Safe — refuses to overwrite an existing .env.local.
function cmdRestore(): void {
	let restored = 0;
	let conflicts = 0;
	for (const rel of ENV_LOCAL_TARGETS) {
		const abs = join(PROJECT_ROOT, rel);
		const backup = abs + STASH_SUFFIX;
		if (!existsSync(backup)) continue;
		if (existsSync(abs)) {
			log(
				`skip ${rel}: target already exists, leaving ${rel}${STASH_SUFFIX} in place`,
			);
			conflicts++;
			continue;
		}
		renameSync(backup, abs);
		log(`restored ${rel}`);
		restored++;
	}
	if (restored === 0 && conflicts === 0) {
		log("no stashed .env.local files found");
	}
}

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
			fatal(`unknown subcommand: ${sub} (use: run | identify | restore)`);
	}
}

await main();
