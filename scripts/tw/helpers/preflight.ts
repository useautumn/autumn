/**
 * `bun tw` preflight — fail fast with ACTIONABLE guidance before we spend minutes
 * building a warm parent and forking 50 sandboxes. Three gates:
 *
 *   1. Vercel auth resolvable (the SDK reads it from env).
 *   2. The Infisical-injected secrets every worker needs are present (catches
 *      "ran bare `bun scripts/tw/...` instead of the `bun tw` wrapper").
 *   3. Git is in a state the µVM can actually run: clean working tree AND the
 *      current HEAD is pushed to `origin/<ref>` (workers clone `origin/<ref>`, so
 *      uncommitted or unpushed work silently doesn't run). `--allow-dirty` skips
 *      gate 3 for intentional debugging.
 *
 * Designed for new teammates: every failure prints exactly what to run.
 */

import chalk from "chalk";

/** Run a git command, returning trimmed stdout ("" on failure). */
const git = (...args: string[]): string => {
	const proc = Bun.spawnSync(["git", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return new TextDecoder().decode(proc.stdout).trim();
};

/** Secrets the worker server needs, normally injected by the `bun tw` Infisical wrapper. */
const REQUIRED_SECRETS = [
	"ENCRYPTION_IV",
	"ENCRYPTION_PASSWORD",
	"BETTER_AUTH_SECRET",
	"STRIPE_SANDBOX_SECRET_KEY",
] as const;

type PreflightProblem = { what: string; fix: string };

const checkVercelAuth = (): PreflightProblem | undefined => {
	const hasOidc = Boolean(process.env.VERCEL_OIDC_TOKEN);
	const hasToken =
		Boolean(process.env.VERCEL_TOKEN) &&
		Boolean(process.env.VERCEL_TEAM_ID) &&
		Boolean(process.env.VERCEL_PROJECT_ID);
	if (hasOidc || hasToken) {
		return undefined;
	}
	return {
		what: "no Vercel credentials (the sandbox SDK can't authenticate)",
		fix: "run `vercel link` then `vercel env pull` (writes VERCEL_OIDC_TOKEN to .env.local), or set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID",
	};
};

const checkSecrets = (): PreflightProblem | undefined => {
	const missing = REQUIRED_SECRETS.filter((name) => !process.env[name]);
	if (missing.length === 0) {
		return undefined;
	}
	return {
		what: `missing secret(s): ${missing.join(", ")}`,
		fix: "run via `bun tw` (the Infisical wrapper) rather than bare `bun scripts/tw/...` — the wrapper injects these from Infisical",
	};
};

const checkGit = (ref: string): PreflightProblem | undefined => {
	const dirty = git("status", "--porcelain");
	if (dirty) {
		return {
			what: "uncommitted changes — workers clone origin/<ref>, so they won't see them",
			fix: `commit + push first (or re-run with --allow-dirty to override):\n      git add -A && git commit -m … && git push`,
		};
	}
	const localHead = git("rev-parse", "HEAD");
	const remoteLine = git("ls-remote", "origin", ref);
	const remoteSha = remoteLine.split(/\s+/)[0] ?? "";
	if (!remoteSha) {
		return {
			what: `ref "${ref}" is not on origin`,
			fix: `git push -u origin ${ref}`,
		};
	}
	if (localHead && remoteSha !== localHead) {
		return {
			what: `local HEAD (${localHead.slice(0, 7)}) is ahead of origin/${ref} (${remoteSha.slice(0, 7)}) — workers would run stale code`,
			fix: `git push origin ${ref}`,
		};
	}
	return undefined;
};

/**
 * Run all preflight gates. On any failure, prints each problem + its fix and
 * exits non-zero. `allowDirty` skips the git gate.
 */
export const runPreflight = ({
	ref,
	allowDirty,
}: {
	ref: string;
	allowDirty: boolean;
}): void => {
	const problems: PreflightProblem[] = [];
	const push = (p: PreflightProblem | undefined) => {
		if (p) {
			problems.push(p);
		}
	};

	push(checkVercelAuth());
	push(checkSecrets());
	if (!allowDirty) {
		push(checkGit(ref));
	}

	if (problems.length === 0) {
		return;
	}

	console.error(
		chalk.red.bold("\n[tw] preflight failed — fix the following:\n"),
	);
	for (const { what, fix } of problems) {
		console.error(`  ${chalk.red("✗")} ${what}`);
		console.error(`    ${chalk.cyan("→")} ${fix}\n`);
	}
	process.exit(1);
};
