import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";
import { isProvisioned } from "./entry.ts";
import { registerPortlessAliases } from "./portless.ts";
import { portlessHttpsUrl } from "./ports.ts";
import { fatal, log } from "./shell.ts";
import { spawnDevInTmux, tmuxSessionName } from "./tmux.ts";
import { rewriteDbEnv } from "./url.ts";

function applyProvisionedDevEnv(
	entry: RegistryEntry,
	env: Record<string, string>,
): Record<string, string> {
	const { worktreeNum, databaseUrl } = entry;
	if (!databaseUrl) fatal("worktree missing databaseUrl");

	let next = rewriteDbEnv(env, databaseUrl);
	if (!next.EMULATE_GOOGLE_URL) {
		next.EMULATE_GOOGLE_URL = portlessHttpsUrl("google.emulate.localhost");
	}
	const portlessCa = join(homedir(), ".portless", "ca.pem");
	if (existsSync(portlessCa) && !next.NODE_EXTRA_CA_CERTS) {
		next.NODE_EXTRA_CA_CERTS = portlessCa;
	}
	const aliases = registerPortlessAliases(worktreeNum);
	next.BETTER_AUTH_URL = aliases.apiUrl;
	next.CLIENT_URL = aliases.viteUrl;
	next.VITE_BACKEND_URL = aliases.apiUrl;
	next.VITE_FRONTEND_URL = aliases.viteUrl;
	if (entry.ngrokUrl && !next.NGROK_URL) {
		next.NGROK_URL = entry.ngrokUrl;
	}
	return next;
}

export function buildDevEnvAndArgs(entry: RegistryEntry): {
	env: Record<string, string>;
	args: string[];
} {
	const { worktreeNum } = entry;
	let env: Record<string, string> = {
		...(process.env as Record<string, string>),
	};
	if (isProvisioned(entry)) {
		env = applyProvisionedDevEnv(entry, env);
	}

	const args = [
		"bun",
		"scripts/dev.ts",
		"--worktree",
		String(worktreeNum),
		...process.argv.slice(3),
	];
	return { env, args };
}

export function startDev(
	entry: RegistryEntry,
	opts?: { allowTmux?: boolean },
): never {
	const { worktreeNum, branchName } = entry;
	const { env, args } = buildDevEnvAndArgs(entry);

	const useTmux =
		(opts?.allowTmux ?? true) && worktreeNum > 1 && !process.stdout.isTTY;
	if (useTmux) {
		log(
			`starting dev in tmux (worktree=${worktreeNum}${branchName ? `, branch=${branchName}` : ""}, non-TTY)`,
		);
		spawnDevInTmux(tmuxSessionName(worktreeNum), env, args, PROJECT_ROOT);
		process.exit(0);
	}

	log(
		`starting dev (worktree=${worktreeNum}${branchName ? `, branch=${branchName}` : ""})`,
	);
	const proc = Bun.spawn(args, {
		cwd: PROJECT_ROOT,
		env,
		stdout: "inherit",
		stderr: "inherit",
	});

	const forward = (sig: NodeJS.Signals) => () => proc.kill(sig);
	process.on("SIGINT", forward("SIGINT"));
	process.on("SIGTERM", forward("SIGTERM"));

	proc.exited.then((code) => process.exit(code ?? 0));
	return undefined as never;
}
