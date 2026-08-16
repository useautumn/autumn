import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";
import { isProvisioned } from "./entry.ts";
import { provisionedInfraEnv } from "./env-files.ts";
import { isHeadless } from "./headless.ts";
import { registerPortlessAliases } from "./portless.ts";
import { devProxyPortFor, portlessHttpsUrl, serverPortFor } from "./ports.ts";
import { fatal, log } from "./shell.ts";
import { spawnDevInTmux, tmuxSessionName } from "./tmux.ts";
import { rewriteDbEnv } from "./url.ts";

const LOCAL_DATABASE_URL =
	"postgresql://postgres:postgres@localhost:5432/autumn";

const HEADLESS_UNSET = [
	"NEON_WORKTREE_API_KEY",
	"MISC_CACHE_DRAGONFLY_PRIVATE_URL",
] as const;

function applyLocalInfra(
	env: Record<string, string>,
	worktreeNum: number,
): Record<string, string> {
	const next = { ...env };
	const infra = provisionedInfraEnv(worktreeNum);
	Object.assign(next, infra);
	for (const key of Object.keys(next)) {
		if (key.includes("SQS_QUEUE_URL") && !(key in infra)) delete next[key];
	}
	for (const key of HEADLESS_UNSET) delete next[key];
	return next;
}

function applyHeadlessPublicUrls({
	entry,
	env,
	worktreeNum,
}: {
	entry: RegistryEntry;
	env: Record<string, string>;
	worktreeNum: number;
}): void {
	const apiUrl = `http://localhost:${serverPortFor(worktreeNum)}`;
	const frontDoor =
		entry.ngrokUrl ?? `http://localhost:${devProxyPortFor(worktreeNum)}`;
	env.AUTUMN_API_URL = apiUrl;
	env.AUTUMN_PUBLIC_API_URL = frontDoor;
	env.CLIENT_URL = frontDoor;
	env.VITE_BACKEND_URL = "/backend";
	env.VITE_FRONTEND_URL = frontDoor;
}

function applyProvisionedDevEnv(
	entry: RegistryEntry,
	env: Record<string, string>,
): Record<string, string> {
	const { worktreeNum, databaseUrl } = entry;
	if (!databaseUrl) fatal("worktree missing databaseUrl");

	const next = applyLocalInfra(rewriteDbEnv(env, databaseUrl), worktreeNum);
	if (!next.EMULATE_GOOGLE_URL) {
		next.EMULATE_GOOGLE_URL = portlessHttpsUrl("google.emulate.localhost");
	}
	const portlessCa = join(homedir(), ".portless", "ca.pem");
	if (existsSync(portlessCa) && !next.NODE_EXTRA_CA_CERTS) {
		next.NODE_EXTRA_CA_CERTS = portlessCa;
	}
	// Headless boxes have no portless binary and nothing resolves *.localhost;
	// .env.local already carries plain localhost URLs there.
	if (!isHeadless()) {
		const aliases = registerPortlessAliases(worktreeNum);
		next.AUTUMN_API_URL = aliases.apiUrl;
		next.AUTUMN_PUBLIC_API_URL = entry.ngrokUrl ?? aliases.apiUrl;
		next.CLIENT_URL = aliases.viteUrl;
		next.VITE_BACKEND_URL = aliases.apiUrl;
		next.VITE_FRONTEND_URL = aliases.viteUrl;
	}
	if (isHeadless()) {
		applyHeadlessPublicUrls({ entry, env: next, worktreeNum });
		next.DATABASE_URL = LOCAL_DATABASE_URL;
		next.DATABASE_CRITICAL_URL = LOCAL_DATABASE_URL;
	}
	return next;
}

function applyHeadlessDevEnv(
	entry: RegistryEntry,
	env: Record<string, string>,
): Record<string, string> {
	const { worktreeNum } = entry;
	const next = applyLocalInfra({ ...env }, worktreeNum);
	applyHeadlessPublicUrls({ entry, env: next, worktreeNum });
	next.DATABASE_URL = LOCAL_DATABASE_URL;
	next.DATABASE_CRITICAL_URL = LOCAL_DATABASE_URL;
	next.STRIPE_WEBHOOK_SKIP_VERIFY = "true";
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
	if (isHeadless()) {
		env = applyHeadlessDevEnv(entry, env);
	} else if (isProvisioned(entry)) {
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
