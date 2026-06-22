#!/usr/bin/env bun
/**
 * `bun tw` CLI dispatch — the cloud test swarm entrypoint (plan §8.6, §9a).
 *
 * Mirrors `scripts/dw/index.ts`'s style (subcommand switch + a `fatal()` helper):
 *
 *   bun tw [group|suite|path …] [--max=N] [--per-worker=K] [--ref=<ref>] [--keep]
 *   bun tw list                 # this user's runs + orphans
 *   bun tw kill <runId>         # tear down one run's resources
 *   bun tw kill --orphans       # tag-sweep fallback for SIGKILL'd runs
 *   bun tw kill-all [--all-users]
 *
 * A bare invocation (no subcommand, or only flags) runs the orchestrator. The
 * subcommands `list` / `kill` / `kill-all` are reserved words; anything else in
 * the first positional slot is treated as a test group/suite/path for `run`.
 */

import chalk from "chalk";
import {
	getAllGroups,
	getAllSuites,
} from "../../server/tests/_groups/index.ts";
import { kill, killAll, killOrphans } from "./commands/kill.ts";
import { list } from "./commands/list.ts";
import { getLastRunExitCode, run } from "./commands/run.ts";
import {
	DEFAULT_PER_WORKER,
	DEFAULT_WORKERS,
	STRIPE_SUBACCOUNT_CONCURRENCY,
} from "./constants.ts";
import { runPreflight } from "./helpers/preflight.ts";
import type { ProviderName } from "./helpers/provider.ts";
import type { TwRunArgs } from "./types.ts";

const RESERVED_SUBCOMMANDS = new Set(["list", "kill", "kill-all"]);

const fatal = (message: string): never => {
	console.error(chalk.red(`[tw] ${message}`));
	process.exit(1);
};

/** Resolve the default git ref under test (current HEAD) when `--ref` is absent. */
const resolveDefaultRef = (): string => {
	const proc = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const ref = new TextDecoder().decode(proc.stdout).trim();
	if (proc.exitCode === 0 && ref && ref !== "HEAD") {
		return ref;
	}
	// Detached HEAD (or git failure) → fall back to the commit sha.
	const shaProc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const sha = new TextDecoder().decode(shaProc.stdout).trim();
	return sha || "HEAD";
};

/** Parse a `--flag=value` int, falling back to `fallback` on absence/garbage. */
const parseIntFlag = (
	args: string[],
	flag: string,
	fallback: number,
): number => {
	const prefix = `${flag}=`;
	const match = args.find((arg) => arg.startsWith(prefix));
	if (!match) {
		return fallback;
	}
	const value = Number.parseInt(match.slice(prefix.length), 10);
	if (Number.isNaN(value) || value <= 0) {
		fatal(
			`${flag} must be a positive integer (got "${match.slice(prefix.length)}")`,
		);
	}
	return value;
};

/** Parse a `--flag=value` string, or undefined when absent. */
const parseStringFlag = (args: string[], flag: string): string | undefined => {
	const prefix = `${flag}=`;
	const match = args.find((arg) => arg.startsWith(prefix));
	return match ? match.slice(prefix.length) : undefined;
};

const parseRunArgs = (args: string[]): TwRunArgs => {
	const groupsOrPatterns = args.filter((arg) => !arg.startsWith("-"));
	const workers = parseIntFlag(args, "--max", DEFAULT_WORKERS);
	const perWorker = parseIntFlag(args, "--per-worker", DEFAULT_PER_WORKER);
	const ref = parseStringFlag(args, "--ref") ?? resolveDefaultRef();
	const keep = args.includes("--keep");
	const allowDirty = args.includes("--allow-dirty");
	// Dashboard is on by default; `--no-dashboard` opts out (`--dashboard` still
	// accepted as an explicit no-op for back-compat).
	const dashboard = !args.includes("--no-dashboard");

	// Cloud backend. Default modal (faster, breaks Vercel's 200-µVM wall); the
	// original Vercel path stays available via --provider=vercel, and the
	// experimental high-scale V2 backend via --provider=modalv2.
	const providerArg = parseStringFlag(args, "--provider") ?? "modal";
	if (
		providerArg !== "vercel" &&
		providerArg !== "modal" &&
		providerArg !== "modalv2"
	) {
		fatal(
			`--provider must be "vercel", "modal", or "modalv2" (got "${providerArg}")`,
		);
	}
	const provider = providerArg as ProviderName;

	// `--stripe-concurrency=N` is surfaced as an env var the (lazily-built) Stripe
	// limiter in helpers/stripe.ts reads when the run starts.
	if (args.some((arg) => arg.startsWith("--stripe-concurrency="))) {
		const concurrency = parseIntFlag(
			args,
			"--stripe-concurrency",
			STRIPE_SUBACCOUNT_CONCURRENCY,
		);
		process.env.STRIPE_SUBACCOUNT_CONCURRENCY = String(concurrency);
	}

	return {
		groupsOrPatterns,
		workers,
		perWorker,
		ref,
		keep,
		allowDirty,
		dashboard,
		provider,
	};
};

/**
 * Render the available test groups (split by tier) and suites as aligned,
 * name → description lines for `--help`. A bare positional to `bun tw` is matched
 * against these names (groups first, then suites) before falling back to a path.
 */
const formatTargets = (): string => {
	const groups = getAllGroups();
	const suites = getAllSuites();
	const names = [...groups.map((g) => g.name), ...suites.map((s) => s.name)];
	const pad = Math.max(...names.map((n) => n.length));
	const line = (name: string, desc: string): string =>
		`  ${chalk.cyan(name.padEnd(pad))}  ${chalk.dim(desc)}`;

	const core = groups.filter((g) => g.tier === "core");
	const domain = groups.filter((g) => g.tier === "domain");

	return [
		chalk.bold("Groups (core):"),
		...core.map((g) => line(g.name, g.description)),
		"",
		chalk.bold("Groups (domain):"),
		...domain.map((g) => line(g.name, g.description)),
		"",
		chalk.bold("Suites:"),
		...suites.map((s) =>
			line(s.name, `${s.description} → ${s.groups.join(", ")}`),
		),
	].join("\n");
};

const printUsage = (): void => {
	console.log(
		[
			chalk.bold("bun tw — cloud test swarm"),
			"",
			"Usage:",
			"  bun tw [group|suite|path …] [--max=N] [--per-worker=K] [--ref=<ref>] [--keep]",
			"  bun tw list                       this user's runs + orphans",
			"  bun tw kill <runId>               tear down one run's resources",
			"  bun tw kill --orphans             tag-sweep fallback for SIGKILL'd runs",
			"  bun tw kill-all [--all-users]     tear down all your non-completed runs",
			"",
			"Flags:",
			`  --max=N      pool size (default ${DEFAULT_WORKERS}); auto-capped to file count`,
			`  --per-worker=K   per-worker file concurrency (default ${DEFAULT_PER_WORKER})`,
			"  --ref=<git-ref>  ref the warm snapshot checks out (default current HEAD)",
			"  --keep           leave the pool up for debugging (clean up with `bun tw kill`)",
			`  --stripe-concurrency=N   concurrent Stripe account creations (default ${STRIPE_SUBACCOUNT_CONCURRENCY})`,
			"  --allow-dirty    skip the preflight git gate (dirty tree / unpushed HEAD)",
			"  --no-dashboard   disable the live web dashboard (on by default; opens + keeps it up after the run)",
			"  --provider=NAME  cloud backend: modal (default), modalv2 (experimental high-scale), or vercel",
			"",
			chalk.bold("Env:"),
			"  STRIPE_TEST_KEY_POOL   comma-separated Stripe platform secret keys; workers",
			"                         shard across them round-robin (K keys ≈ K× the Stripe",
			"                         rate limit). Falls back to STRIPE_SANDBOX_SECRET_KEY.",
			"",
			formatTargets(),
		].join("\n"),
	);
};

const main = async (): Promise<void> => {
	const argv = process.argv.slice(2);
	const sub = argv[0];

	if (sub === "--help" || sub === "-h" || sub === "help") {
		printUsage();
		process.exit(0);
	}

	// A bare invocation (no subcommand or only flags) runs the orchestrator.
	if (!sub || sub.startsWith("-") || !RESERVED_SUBCOMMANDS.has(sub)) {
		const runArgs = parseRunArgs(argv);
		runPreflight({ ref: runArgs.ref, allowDirty: runArgs.allowDirty });
		await run(runArgs);
		process.exit(getLastRunExitCode());
	}

	// Each completed subcommand exits explicitly: imported modules (DB pool, redis,
	// the Vercel SDK) leave open handles that keep the event loop alive, so falling
	// out of the switch would hang the CLI. `fatal()` already exits non-zero.
	switch (sub) {
		case "list":
			await list();
			process.exit(0);
			break;

		case "kill": {
			const rest = argv.slice(1);
			if (rest.includes("--orphans")) {
				await killOrphans();
				process.exit(0);
				break;
			}
			const runId = rest.find((arg) => !arg.startsWith("-"));
			if (!runId) {
				fatal("kill requires a <runId> (or use `kill --orphans`)");
			}
			await kill(runId as string);
			process.exit(0);
			break;
		}

		case "kill-all":
			await killAll({ allUsers: argv.includes("--all-users") });
			process.exit(0);
			break;

		default:
			fatal(
				`unknown subcommand: ${sub} (use: list | kill | kill-all, or a test target)`,
			);
	}
};

await main();
