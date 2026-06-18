#!/usr/bin/env bun
/**
 * `bun tw` CLI dispatch — the cloud test swarm entrypoint (plan §8.6, §9a).
 *
 * Mirrors `scripts/dw/index.ts`'s style (subcommand switch + a `fatal()` helper):
 *
 *   bun tw [group|suite|path …] [--workers=N] [--per-worker=K] [--ref=<ref>] [--keep]
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
import { kill, killAll, killOrphans } from "./commands/kill.ts";
import { list } from "./commands/list.ts";
import { getLastRunExitCode, run } from "./commands/run.ts";
import { DEFAULT_PER_WORKER, DEFAULT_WORKERS } from "./constants.ts";
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
	const workers = parseIntFlag(args, "--workers", DEFAULT_WORKERS);
	const perWorker = parseIntFlag(args, "--per-worker", DEFAULT_PER_WORKER);
	const ref = parseStringFlag(args, "--ref") ?? resolveDefaultRef();
	const keep = args.includes("--keep");
	return { groupsOrPatterns, workers, perWorker, ref, keep };
};

const printUsage = (): void => {
	console.log(
		[
			chalk.bold("bun tw — cloud test swarm"),
			"",
			"Usage:",
			"  bun tw [group|suite|path …] [--workers=N] [--per-worker=K] [--ref=<ref>] [--keep]",
			"  bun tw list                       this user's runs + orphans",
			"  bun tw kill <runId>               tear down one run's resources",
			"  bun tw kill --orphans             tag-sweep fallback for SIGKILL'd runs",
			"  bun tw kill-all [--all-users]     tear down all your non-completed runs",
			"",
			"Flags:",
			`  --workers=N      pool size (default ${DEFAULT_WORKERS}); auto-capped to file count`,
			`  --per-worker=K   per-worker file concurrency (default ${DEFAULT_PER_WORKER})`,
			"  --ref=<git-ref>  ref the warm snapshot checks out (default current HEAD)",
			"  --keep           leave the pool up for debugging (clean up with `bun tw kill`)",
		].join("\n"),
	);
};

const main = async (): Promise<void> => {
	const argv = process.argv.slice(2);
	const sub = argv[0];

	if (sub === "--help" || sub === "-h" || sub === "help") {
		printUsage();
		return;
	}

	// A bare invocation (no subcommand or only flags) runs the orchestrator.
	if (!sub || sub.startsWith("-") || !RESERVED_SUBCOMMANDS.has(sub)) {
		const runArgs = parseRunArgs(argv);
		await run(runArgs);
		process.exit(getLastRunExitCode());
	}

	switch (sub) {
		case "list":
			await list();
			break;

		case "kill": {
			const rest = argv.slice(1);
			if (rest.includes("--orphans")) {
				await killOrphans();
				break;
			}
			const runId = rest.find((arg) => !arg.startsWith("-"));
			if (!runId) {
				fatal("kill requires a <runId> (or use `kill --orphans`)");
			}
			await kill(runId as string);
			break;
		}

		case "kill-all":
			await killAll({ allUsers: argv.includes("--all-users") });
			break;

		default:
			fatal(
				`unknown subcommand: ${sub} (use: list | kill | kill-all, or a test target)`,
			);
	}
};

await main();
