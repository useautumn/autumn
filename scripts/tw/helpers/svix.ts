/**
 * Build-time Svix partitioner for the `bun tw` swarm (plan §7).
 *
 * Detection rule (exact, verified): a test file needs Svix iff it imports
 * `@tests/integration/utils/svixWebhookTestUtils`. There is a single entrypoint,
 * imported directly (no barrel), so a one-hop static scan over each `.test.ts`
 * has zero false positives/negatives.
 *
 * Routing: per §7's recommendation, ALL Svix files (26 at time of writing) are
 * routed onto ONE dedicated "svix shard" — a single worker that runs them
 * sequentially. They're simple, fast tests, and a single shard means exactly one
 * `createSvixApp` + one worker with `SVIX_API_KEY` injected per run. Every other
 * worker leaves `SVIX_API_KEY` unset, keeping the general pool fully isolated.
 */

import { readFile } from "node:fs/promises";
import { AppEnv } from "@autumn/shared";
import {
	createSvixApp as serverCreateSvixApp,
	deleteSvixApp as serverDeleteSvixApp,
} from "@server/external/svix/svixHelpers.js";
import { createSvixCli } from "@server/external/svix/svixUtils.js";
import { TEST_ORG_CONFIG } from "../../setupTestUtils/createTestOrg.ts";
import type { ShardPlan } from "../types.js";

/** Matches `from "@tests/integration/utils/svixWebhookTestUtils"` (optional `.js`). */
const SVIX_IMPORT_REGEX =
	/from\s+["']@tests\/integration\/utils\/svixWebhookTestUtils(\.js)?["']/;

/** Max number of files read concurrently to keep file-descriptor pressure bounded. */
const READ_CONCURRENCY = 32;

/**
 * Returns whether a single test file needs the Svix shard by statically scanning
 * its source for the `svixWebhookTestUtils` import. Returns `false` (and does not
 * throw) when the file can't be read, so a transient read error never silently
 * promotes a non-Svix file onto the dedicated shard.
 */
export const needsSvix = async (file: string): Promise<boolean> => {
	try {
		const source = await readFile(file, "utf8");
		return SVIX_IMPORT_REGEX.test(source);
	} catch {
		return false;
	}
};

/**
 * Partitions the selected test files into the dedicated Svix shard
 * (`svixFiles`) vs. the general pool (`normalFiles`) by scanning each file's
 * imports. Files are read concurrently with a bounded window; the input order is
 * preserved within each bucket.
 */
export const partitionShards = async (
	testFiles: string[],
): Promise<ShardPlan> => {
	const flags = new Array<boolean>(testFiles.length);

	for (let start = 0; start < testFiles.length; start += READ_CONCURRENCY) {
		const window = testFiles.slice(start, start + READ_CONCURRENCY);
		const results = await Promise.all(window.map((file) => needsSvix(file)));
		for (const [offset, isSvix] of results.entries()) {
			flags[start + offset] = isSvix;
		}
	}

	const svixFiles: string[] = [];
	const normalFiles: string[] = [];
	for (const [index, file] of testFiles.entries()) {
		if (flags[index]) {
			svixFiles.push(file);
		} else {
			normalFiles.push(file);
		}
	}

	return { svixFiles, normalFiles };
};

/**
 * Orchestrator-side Svix app creation (plan §7/§9a). The orchestrator creates +
 * records the one dedicated svix-shard app BEFORE the worker boots, so a
 * fork/boot failure can never orphan an untracked Svix app. The worker then only
 * BINDS this id into `svix_config` (it no longer calls `createSvixApp` itself).
 *
 * Reuses the server's `createSvixApp` via the `@server/*` alias (the `svix`
 * package isn't resolvable from the scripts workspace — it's nested under
 * `server/node_modules`). `createSvixApp` is wrapped in `safeSvix`, so it returns
 * undefined when `SVIX_API_KEY` is unset; we throw loudly because a mixed/svix run
 * cannot proceed without a real app id. Mirrors `boot.ts`'s former naming so the
 * Svix app is recognizable in the dashboard.
 */
export const createSvixApp = async (orgId: string): Promise<string> => {
	if (!process.env.SVIX_API_KEY) {
		throw new Error(
			"[tw] SVIX_API_KEY is required to provision the dedicated svix shard's app — resolve it into the orchestrator env before `bun tw`",
		);
	}

	const app = await serverCreateSvixApp({
		name: `${TEST_ORG_CONFIG.slug}_${AppEnv.Sandbox}`,
		orgId,
		env: AppEnv.Sandbox,
	});

	if (!app?.id) {
		throw new Error(
			"[tw] createSvixApp returned no app id — cannot provision the svix shard",
		);
	}

	return app.id;
};

/**
 * Orphan sweep for the dedicated svix-shard app (plan §9a `kill --orphans`),
 * mirroring the Stripe sub-account + Vercel sandbox sweeps: deletes test Svix
 * apps left behind by runs that SIGKILLed before recording `entry.svixAppId`.
 *
 * IMPORTANT: unlike Stripe/Vercel orphans, Svix test apps carry NO per-owner
 * tag today — every run names its app `<slug>_<env>` and tags it
 * `{ org_id, env }` for the SHARED unit-test org. So we cannot scope by owner;
 * the AGE CUTOFF is the only thing preventing us from nuking an in-flight run's
 * app. Keep `olderThanMs` aligned with the other sweeps' cutoff.
 *
 * No-ops (returns 0) when `SVIX_API_KEY` is unset so non-Svix users never error.
 * Per-app delete failures are logged and skipped. Returns the count deleted.
 */
export const sweepOrphanSvixApps = async ({
	olderThanMs,
}: {
	olderThanMs: number;
}): Promise<number> => {
	if (!process.env.SVIX_API_KEY) {
		return 0;
	}

	const svix = createSvixCli();
	const cutoff = Date.now() - olderThanMs;

	// Collect every application across all pages first (paginate via the
	// `iterator`/`done` cursor the SDK returns), then delete the test orphans.
	const apps: Awaited<
		ReturnType<typeof svix.application.list>
	>["data"] = [];
	let iterator: string | null | undefined;
	do {
		const page = await svix.application.list({ iterator });
		apps.push(...page.data);
		iterator = page.iterator;
		if (page.done) {
			break;
		}
	} while (iterator);

	const orphans = apps.filter((app) => {
		const isTestApp =
			app.metadata?.org_id === TEST_ORG_CONFIG.id ||
			app.name.startsWith(`${TEST_ORG_CONFIG.slug}_`);
		return isTestApp && new Date(app.createdAt).getTime() < cutoff;
	});

	let deleted = 0;
	for (const app of orphans) {
		try {
			await serverDeleteSvixApp({ appId: app.id });
			deleted++;
		} catch (error) {
			console.warn(
				`[tw] failed to delete orphan svix app ${app.id}: ${(error as Error).message}`,
			);
		}
	}

	return deleted;
};
