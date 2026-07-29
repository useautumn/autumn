/**
 * `bun tw doctor` — fast, read-only health check of everything a run depends
 * on: git state, the Modal warm-image cache, the Stripe sub-account pool
 * (including an in-flight teardown from a prior run), global locks, env, and
 * the provider defaults. Prints ✓/⚠/✗ lines; exits 1 if anything is ✗.
 */

import chalk from "chalk";
import { ModalClient } from "modal";
import {
	DEFAULT_PER_WORKER,
	DEFAULT_WORKERS,
	WARM_SANDBOX_PREFIX,
} from "../constants.ts";
import { listHeldLocks } from "../helpers/lock.ts";
import { allPoolKeys } from "../helpers/stripeKeyPool.ts";
import { type PoolCensus, poolCensus } from "../helpers/stripePool.ts";

const ok = (line: string): void => console.log(`  ${chalk.green("✓")} ${line}`);
const warnLine = (line: string): void =>
	console.log(`  ${chalk.yellow("⚠")} ${line}`);
const info = (line: string): void => console.log(`  ${chalk.dim("·")} ${line}`);
const section = (title: string): void => console.log(`\n${chalk.bold(title)}`);

/** Race a check against a deadline so one slow backend can't stall doctor. */
const timeBoxed = <T>(
	ms: number,
	fn: () => Promise<T>,
): Promise<T | "timeout"> =>
	Promise.race([
		fn(),
		new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), ms),
		),
	]);

const git = (...args: string[]): string => {
	const proc = Bun.spawnSync(["git", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return new TextDecoder().decode(proc.stdout).trim();
};

const fmtAge = (ms: number): string => {
	const s = Math.round(ms / 1000);
	return s >= 120 ? `${Math.round(s / 60)}m` : `${s}s`;
};

/** How many commits HEAD is ahead of the sha `:latest` was built from. */
const REV_WALK_LIMIT = 30;

type WarmCacheStatus =
	| { kind: "exact" }
	| { kind: "stale"; sha12?: string; behind?: number }
	| { kind: "cold" }
	| { kind: "error"; message: string };

const checkWarmCache = async (sha12: string): Promise<WarmCacheStatus> => {
	try {
		const modal = new ModalClient({ logLevel: "error" });
		const lookup = (tag: string) =>
			modal.images.fromName(`tw-warm:${tag}`).catch(() => undefined);
		const [exact, latest] = await Promise.all([
			lookup(sha12),
			lookup("latest"),
		]);
		if (exact) {
			return { kind: "exact" };
		}
		if (!latest) {
			return { kind: "cold" };
		}
		// Which commit is `:latest` from? Walk recent history comparing imageIds.
		const revs = git("rev-list", `-n${REV_WALK_LIMIT}`, "HEAD")
			.split("\n")
			.filter(Boolean)
			.map((sha) => sha.slice(0, 12));
		const matches = await Promise.all(
			revs.map(async (rev, index) => {
				const image = await lookup(rev);
				return image?.imageId === latest.imageId ? index : undefined;
			}),
		);
		const behind = matches.find((index) => index !== undefined);
		return behind === undefined
			? { kind: "stale" }
			: { kind: "stale", sha12: revs[behind], behind };
	} catch (error) {
		return { kind: "error", message: (error as Error).message };
	}
};

const printGitSection = (): { sha12: string } => {
	section("git");
	const ref = git("rev-parse", "--abbrev-ref", "HEAD") || "HEAD";
	const sha = git("rev-parse", "HEAD");
	const sha12 = sha.slice(0, 12);
	ok(`ref ${ref} @ ${sha12} (warm image key ${WARM_SANDBOX_PREFIX}-${sha12})`);
	if (git("status", "--porcelain")) {
		warnLine(
			"working tree dirty — workers clone origin/<ref> (use --allow-dirty knowingly)",
		);
	}
	const remoteSha = git("ls-remote", "origin", ref).split(/\s+/)[0] ?? "";
	if (ref !== "HEAD" && remoteSha && remoteSha !== sha) {
		warnLine(
			`local HEAD not on origin/${ref} (${remoteSha.slice(0, 7)}) — workers would run stale code`,
		);
	}
	return { sha12 };
};

const printWarmSection = (
	status: WarmCacheStatus | "timeout",
	sha12: string,
): void => {
	section("warm cache (modal)");
	if (status === "timeout") {
		warnLine("Modal lookup timed out — cache state unknown");
		return;
	}
	switch (status.kind) {
		case "exact":
			ok(
				`exact warm image tw-warm:${sha12} published — next run skips the entire warm build`,
			);
			break;
		case "stale":
			warnLine(
				status.behind !== undefined
					? `stale warm hit: tw-warm:latest @ ${status.sha12} (${status.behind} commit(s) behind) — workers fast-forward at boot`
					: `stale warm hit: tw-warm:latest exists but its sha is not in the last ${REV_WALK_LIMIT} commits (off-branch or far behind) — workers fast-forward at boot`,
			);
			break;
		case "cold":
			warnLine(
				"cold — no tw-warm image published; the next run pays the full warm build",
			);
			break;
		default:
			warnLine(`Modal unreachable (${status.message.slice(0, 120)})`);
	}
};

const printPoolSection = (
	censuses: PoolCensus[] | "timeout" | { error: string },
): boolean => {
	section("stripe pool");
	if (censuses === "timeout") {
		warnLine("Stripe pool census timed out");
		return false;
	}
	if ("error" in (censuses as { error?: string })) {
		warnLine(
			`census failed (${(censuses as { error: string }).error.slice(0, 120)})`,
		);
		return false;
	}
	let nukingNow = 0;
	let nukingStale = 0;
	let oldest: number | undefined;
	for (const census of censuses as PoolCensus[]) {
		info(
			`key ${census.keyIndex}: ${census.clean} clean · ${census.dirty} dirty · ${census.nukingInProgress + census.nukingStale} nuking`,
		);
		nukingNow += census.nukingInProgress;
		nukingStale += census.nukingStale;
		if (census.oldestNukingAt && (!oldest || census.oldestNukingAt < oldest)) {
			oldest = census.oldestNukingAt;
		}
	}
	if (nukingNow > 0) {
		warnLine(
			`teardown from a prior run IN PROGRESS: ${nukingNow} account(s) nuking (started ${oldest ? fmtAge(Date.now() - oldest) : "?"} ago) — new claims wait for it`,
		);
	} else {
		ok("no teardown in progress");
	}
	if (nukingStale > 0) {
		warnLine(
			`${nukingStale} account(s) stuck in \`nuking\` (crashed nuke) — the next teardown's stale sweep reclaims them`,
		);
	}
	return true;
};

const ENV_REQUIRED = [
	"ENCRYPTION_IV",
	"ENCRYPTION_PASSWORD",
	"BETTER_AUTH_SECRET",
	"MODAL_TOKEN_ID",
	"MODAL_TOKEN_SECRET",
] as const;
const ENV_WARN = [
	"TINYBIRD_US_EAST_API_URL",
	"TINYBIRD_US_EAST_TOKEN",
] as const;

const printEnvSection = (): boolean => {
	section("env");
	let failed = false;
	for (const name of ENV_REQUIRED) {
		if (process.env[name]) {
			ok(name);
		} else {
			failed = true;
			console.log(
				`  ${chalk.red("✗")} ${name} missing — run via \`bun tw\` (the Infisical wrapper injects it)`,
			);
		}
	}
	const poolKeys = process.env.STRIPE_TEST_KEY_POOL?.split(",").filter(Boolean);
	if (poolKeys?.length) {
		ok(`STRIPE_TEST_KEY_POOL (${poolKeys.length} key(s))`);
	} else if (process.env.STRIPE_SANDBOX_SECRET_KEY) {
		ok(
			"STRIPE_SANDBOX_SECRET_KEY (pool of one — set STRIPE_TEST_KEY_POOL to shard)",
		);
	} else {
		failed = true;
		console.log(
			`  ${chalk.red("✗")} no Stripe key — set STRIPE_TEST_KEY_POOL or STRIPE_SANDBOX_SECRET_KEY`,
		);
	}
	for (const name of ENV_WARN) {
		if (process.env[name]) {
			ok(name);
		} else {
			warnLine(`${name} missing — analytics tests will not have Tinybird`);
		}
	}
	if (process.env.FREESTYLE_API_KEY) {
		ok("FREESTYLE_API_KEY");
	} else {
		warnLine(
			"FREESTYLE_API_KEY missing (optional — only --provider=freestyle needs it)",
		);
	}
	return failed;
};

export const doctor = async (): Promise<number> => {
	console.log(chalk.bold("bun tw doctor"));

	const { sha12 } = printGitSection();

	// Remote checks run concurrently, each time-boxed, then print in order.
	const [warmStatus, censusResult, locks] = await Promise.all([
		timeBoxed(8000, () => checkWarmCache(sha12)),
		timeBoxed(20_000, () =>
			(async () => {
				try {
					allPoolKeys();
				} catch (error) {
					return { error: (error as Error).message };
				}
				// Pool accounts are recent — 3 newest-first pages per key is plenty
				// for a health check and keeps doctor fast on huge platform accounts.
				return await poolCensus(3);
			})(),
		),
		timeBoxed(8000, () => listHeldLocks()),
	]);

	printWarmSection(warmStatus, sha12);
	printPoolSection(censusResult);

	section("locks (refs/tw/locks/*)");
	if (locks === "timeout") {
		warnLine("lock listing timed out");
	} else if (locks.length === 0) {
		ok("no global locks held");
	} else {
		for (const lock of locks) {
			const age = lock.meta ? fmtAge(Date.now() - lock.meta.startedAt) : "?";
			warnLine(
				`${lock.name} held by ${lock.meta?.owner ?? "unknown"} (run ${lock.meta?.runId ?? "?"}, ${age}) — auto-broken after 5m`,
			);
		}
	}

	const envFailed = printEnvSection();

	section("defaults");
	info(
		`provider modalv2 · workers ${DEFAULT_WORKERS} (--max) · per-worker ${DEFAULT_PER_WORKER} · region ${process.env.TW_MODAL_REGION ?? "us-east-1"}`,
	);

	console.log("");
	return envFailed ? 1 : 0;
};
