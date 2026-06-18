/**
 * `bun tw kill` — recover/clean up swarm resources from the run registry (§9a).
 *
 * Three entry points, all idempotent + time-boxed per resource (a hung sandbox
 * can't block exit), all driven from the authoritative registry (not provider
 * listing), with a tag-sweep fallback for SIGKILL'd runs that never reached it:
 *
 *   - `kill(runId)`    — run the teardown sequence for every resource recorded
 *                        for that run, then drop the entry.
 *   - `killAll()`      — same for every current-owner non-`completed` run. Refuses
 *                        to touch other owners' runs unless `--all-users`.
 *   - `killOrphans()`  — tag-sweep fallback: delete stale Stripe sub-accounts
 *                        (helpers/stripe.sweepOrphans) + Vercel sandboxes
 *                        (helpers/vercel.listSandboxesByOwner) by the owner tag.
 *
 * The teardown sequence mirrors `run.ts` exactly (plan §9a teardown #4):
 * Stripe sub-account → (svix) app → Vercel sandbox → drop the registry record.
 */

import chalk from "chalk";
import { getOwner } from "../helpers/owner.ts";
import * as registry from "../helpers/registry.ts";
import {
	deleteConnectWebhook,
	deleteSubAccount,
	sweepOrphans,
} from "../helpers/stripe.ts";
import { sweepOrphanSvixApps } from "../helpers/svix.ts";
import { deleteSandbox, listSandboxesByOwner } from "../helpers/vercel.ts";
import type { RegistryEntry } from "../types.ts";
import { deleteSvixApp } from "./run.ts";

const TEARDOWN_PER_RESOURCE_TIMEOUT_MS = 20_000;
/** Default age cutoff for `kill --orphans` so we never nuke a live worker (§9a). */
const ORPHAN_CUTOFF_MS = 60 * 60 * 1000;
/** A sandbox older than this AND not in the registry is treated as an orphan. */
const ORPHAN_SANDBOX_AGE_MS = ORPHAN_CUTOFF_MS;

const log = (message: string): void => {
	console.log(chalk.cyan(`[tw] ${message}`));
};

const warn = (message: string): void => {
	console.warn(chalk.yellow(`[tw] ${message}`));
};

/** Run a best-effort, time-boxed async action; never throws. */
const timeBoxed = async (
	label: string,
	action: () => Promise<void>,
	timeoutMs: number = TEARDOWN_PER_RESOURCE_TIMEOUT_MS,
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(() => {
			warn(`${label} timed out after ${timeoutMs}ms — moving on`);
			resolve();
		}, timeoutMs);
	});
	try {
		await Promise.race([action(), timeout]);
	} catch (error) {
		warn(`${label} failed: ${(error as Error).message}`);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
};

/**
 * Tear down every resource recorded for one run entry (Stripe → Svix → Vercel),
 * then drop the registry record. Idempotent: every step tolerates "already
 * deleted". This is the same sequence `run.ts` runs at natural end (plan §9a #4).
 */
const teardownEntry = async (entry: RegistryEntry): Promise<void> => {
	log(
		`killing run ${entry.runId} (${entry.subAccounts.length} sub-account(s), ${entry.sandboxes.length} sandbox(es)${
			entry.svixAppId ? ", 1 svix app" : ""
		})`,
	);

	for (const accountId of entry.subAccounts) {
		await timeBoxed(`delete sub-account ${accountId}`, () =>
			deleteSubAccount(accountId),
		);
	}

	// The shared platform Connect webhook is NOT cascade-deleted by sub-account
	// deletion, so drop recorded webhooks explicitly (matches run.ts teardown, §9a).
	for (const webhook of entry.webhooks) {
		await timeBoxed(`delete connect webhook ${webhook.webhookId}`, () =>
			deleteConnectWebhook(webhook.webhookId),
		);
	}

	if (entry.svixAppId) {
		await timeBoxed(`delete svix app ${entry.svixAppId}`, () =>
			deleteSvixApp(entry.svixAppId as string),
		);
	}

	for (const sandbox of entry.sandboxes) {
		await timeBoxed(`delete sandbox ${sandbox.name}`, () =>
			deleteSandbox(sandbox.name),
		);
	}

	await registry.removeRun(entry.runId);
	log(`run ${entry.runId} killed and removed from the registry`);
};

/** Tear down one run by id, from the registry (plan §9a `kill <runId>`). */
export const kill = async (runId: string): Promise<void> => {
	const entry = await registry.getRun(runId);
	if (!entry) {
		warn(`no run ${runId} in the registry (already cleaned up?)`);
		return;
	}

	const owner = getOwner();
	if (entry.owner !== owner) {
		throw new Error(
			`run ${runId} is owned by "${entry.owner}", not "${owner}" — refusing (use kill-all --all-users to override scope)`,
		);
	}

	await teardownEntry(entry);
};

/**
 * Tear down all of the CURRENT owner's non-`completed` runs (plan §9a
 * `kill-all`). `allUsers` (the `--all-users` flag) extends the scope to every
 * owner's runs — never the default, so a teammate's live swarm isn't nuked.
 */
export const killAll = async ({
	allUsers = false,
}: {
	allUsers?: boolean;
} = {}): Promise<void> => {
	const owner = getOwner();
	const all = await registry.load();
	const entries = Object.values(all).filter(
		(entry) =>
			entry.status !== "completed" && (allUsers || entry.owner === owner),
	);

	if (entries.length === 0) {
		log(
			allUsers
				? "no non-completed runs in the registry"
				: `no non-completed runs for owner "${owner}"`,
		);
		return;
	}

	log(
		`killing ${entries.length} run(s)${allUsers ? " (ALL users)" : ` for "${owner}"`}`,
	);
	for (const entry of entries) {
		await teardownEntry(entry);
	}
};

/**
 * Tag-sweep fallback for SIGKILL'd runs that never reached the registry (plan
 * §9a `kill --orphans`): delete stale Stripe sub-accounts (by
 * `metadata.autumn_tw_owner`) and Vercel sandboxes (by `owner` tag / name
 * prefix) older than the cutoff. Owner-scoped so a teammate's swarm is untouched.
 *
 * Also sweeps orphaned Svix test apps older than the cutoff. Those carry no
 * per-owner tag (shared unit-test org), so the age cutoff alone guards against
 * nuking an in-flight run's app — see `sweepOrphanSvixApps`.
 */
export const killOrphans = async ({
	olderThanMs = ORPHAN_CUTOFF_MS,
}: {
	olderThanMs?: number;
} = {}): Promise<void> => {
	const owner = getOwner();
	log(`sweeping orphans for "${owner}" older than ${olderThanMs}ms`);

	// Stripe sub-accounts (tag + age guarded in the helper).
	const deletedAccounts = await sweepOrphans({ owner, olderThanMs }).catch(
		(error) => {
			warn(`stripe sweep failed: ${(error as Error).message}`);
			return [] as string[];
		},
	);
	log(`stripe: deleted ${deletedAccounts.length} orphan sub-account(s)`);

	// Vercel sandboxes (owner tag / name prefix).
	let listed: Awaited<ReturnType<typeof listSandboxesByOwner>> = [];
	try {
		listed = await listSandboxesByOwner(owner);
	} catch (error) {
		warn(`vercel sandbox list failed: ${(error as Error).message}`);
	}

	const cutoff = Date.now() - ORPHAN_SANDBOX_AGE_MS;
	let deletedSandboxes = 0;
	for (const sandbox of listed) {
		if (sandbox.createdAt > cutoff) {
			continue;
		}
		await timeBoxed(`delete orphan sandbox ${sandbox.name}`, async () => {
			await deleteSandbox(sandbox.name);
			deletedSandboxes++;
		});
	}
	log(`vercel: deleted ${deletedSandboxes} orphan sandbox(es)`);

	// Svix test apps (shared org — age cutoff is the only in-flight guard).
	const deletedSvixApps = await sweepOrphanSvixApps({ olderThanMs }).catch(
		(error) => {
			warn(`svix sweep failed: ${(error as Error).message}`);
			return 0;
		},
	);
	log(`svix: deleted ${deletedSvixApps} orphan app(s)`);

	// Drop any registry entries whose resources are now gone (best-effort).
	const all = await registry.load();
	for (const entry of Object.values(all)) {
		if (entry.owner === owner && entry.status !== "completed") {
			await registry.markCancelled(entry.runId).catch(() => {
				// best-effort
			});
		}
	}
};
