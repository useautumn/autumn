import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROJECT_ROOT } from "../constants.ts";
import type { RegistryEntry } from "../types.ts";
import { isProvisioned } from "./entry.ts";
import { provisionedInfraEnv } from "./env-files.ts";
import { isHeadless } from "./headless.ts";
import { ensureNgrok, publicOrigin } from "./ngrok.ts";
import { registerPortlessAliases } from "./portless.ts";
import { portlessHttpsUrl, serverPortFor } from "./ports.ts";
import { pathProxyPublicEnv } from "./publicUrls.ts";
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
	return next;
}

function applyPublicUrls({
	entry,
	env,
}: {
	entry: RegistryEntry;
	env: Record<string, string>;
}): void {
	const origin = publicOrigin({ entry });
	if (origin?.startsWith("https://")) {
		Object.assign(
			env,
			pathProxyPublicEnv({ origin, worktreeNum: entry.worktreeNum }),
		);
		return;
	}
	if (isHeadless() || !isProvisioned(entry)) {
		env.AUTUMN_API_URL = `http://localhost:${serverPortFor(entry.worktreeNum)}`;
		return;
	}
	const aliases = registerPortlessAliases(entry.worktreeNum);
	env.AUTUMN_API_URL = aliases.apiUrl;
	env.AUTUMN_PUBLIC_API_URL = entry.ngrokUrl ?? aliases.apiUrl;
	env.CLIENT_URL = aliases.viteUrl;
	env.VITE_BACKEND_URL = aliases.apiUrl;
	env.VITE_FRONTEND_URL = aliases.viteUrl;
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
	applyPublicUrls({ entry, env: next });
	return next;
}

function applyHeadlessDevEnv(
	entry: RegistryEntry,
	env: Record<string, string>,
): Record<string, string> {
	const next = applyLocalInfra({ ...env }, entry.worktreeNum);
	for (const key of HEADLESS_UNSET) delete next[key];
	applyPublicUrls({ entry, env: next });
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

export async function startDev(
	entry: RegistryEntry,
	opts?: { allowTmux?: boolean },
): Promise<never> {
	const current = await ensureNgrok(entry);
	const { worktreeNum, branchName } = current;
	const { env, args } = buildDevEnvAndArgs(current);

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
