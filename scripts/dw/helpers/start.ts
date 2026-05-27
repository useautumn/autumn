import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { log, fatal } from "./shell.ts";
import { registerPortlessAliases } from "./portless.ts";
import { rewriteDbEnv } from "./url.ts";
import { aliasesFor, killOwnPorts } from "./ports.ts";
import { getSparqUrls } from "./sparq.ts";
import { tmuxSessionName, spawnDevInTmux } from "./tmux.ts";
import {
	PROJECT_ROOT,
	SPARQ_DOMAIN,
	EMULATE_GOOGLE_URL_DEFAULT,
} from "../constants.ts";
import type { RegistryEntry } from "../types.ts";

export function buildDevEnvAndArgs(entry: RegistryEntry): {
	env: Record<string, string>;
	args: string[];
} {
	const { worktreeNum, databaseUrl } = entry;
	let env: Record<string, string> = {
		...(process.env as Record<string, string>),
	};
	if (worktreeNum > 1) {
		if (!databaseUrl) fatal("agent worktree missing databaseUrl");
		env = rewriteDbEnv(env, databaseUrl);
		if (!env.EMULATE_GOOGLE_URL) {
			env.EMULATE_GOOGLE_URL = EMULATE_GOOGLE_URL_DEFAULT;
		}
		if (!env.DEV_EXTRA_CORS_ORIGINS) {
			env.DEV_EXTRA_CORS_ORIGINS = SPARQ_DOMAIN;
		}
		const portlessCa = join(homedir(), ".portless", "ca.pem");
		if (existsSync(portlessCa) && !env.NODE_EXTRA_CA_CERTS) {
			env.NODE_EXTRA_CA_CERTS = portlessCa;
		}
		const aliases = registerPortlessAliases(worktreeNum);
		// Sparq URLs take precedence — the bundled vite app is loaded over the
		// sparq hostname, so server-side BETTER_AUTH_URL/CLIENT_URL must match
		// or auth cookies / OAuth callbacks break on origin mismatch.
		const sparq = getSparqUrls(entry.path, worktreeNum);
		const apiUrl = sparq?.apiUrl ?? aliases.apiUrl;
		const viteUrl = sparq?.viteUrl ?? aliases.viteUrl;
		env.BETTER_AUTH_URL = apiUrl;
		env.CLIENT_URL = viteUrl;
		env.VITE_BACKEND_URL = apiUrl;
		env.VITE_FRONTEND_URL = viteUrl;
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

export function startDev(entry: RegistryEntry, opts?: { allowTmux?: boolean }): never {
	const { worktreeNum, branchName } = entry;
	const { env, args } = buildDevEnvAndArgs(entry);

	// Agent worktrees (N > 1) in a non-TTY invocation: wrap in detached tmux
	// so the calling agent doesn't block. Canonical (N=1) stays inline always.
	// Node/Bun sets isTTY to true when stdout is a TTY and undefined otherwise.
	const useTmux = (opts?.allowTmux ?? true) && worktreeNum > 1 && !process.stdout.isTTY;
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
