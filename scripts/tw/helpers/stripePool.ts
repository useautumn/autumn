/**
 * Persistent Stripe sub-account POOL for the swarm.
 *
 * Pool state lives IN Stripe (no local file is authoritative): every pooled
 * sub-account carries `metadata.autumn_tw_pool="1"` and
 * `metadata.autumn_tw_pool_state=clean|dirty|nuking`. A run CLAIMS clean
 * accounts (list newest-first + mark dirty), tops up by creating tagged
 * accounts for any shortfall, and at teardown a detached sandbox marks each
 * used account `nuking`, NUKES its contents, and flips the state back to clean
 * (scripts/tw/image/nuke-accounts.mjs). A claim finding too few clean accounts
 * while a recent nuke is in flight WAITS for it instead of top-up-creating.
 *
 * Claiming is a read-modify-write race across teammates' machines, so callers
 * MUST hold the `stripe-pool` global lock (helpers/lock.ts) around
 * {@link claimPoolAccounts}. The async nuke needs no lock — it only touches
 * accounts its own run already claimed.
 */

import pLimit from "p-limit";
import type { OwnerTag } from "../types.js";
import { createSandboxSubAccount } from "./stripe.js";
import {
	allPoolKeys,
	encodeSubAccount,
	stripeClientForKey,
	stripeKeyByIndex,
	stripeKeyForWorker,
} from "./stripeKeyPool.js";

const CLAIM_CONCURRENCY = 16;
const POOL_LIST_PAGE = 100;
/** Stop paging a key once this many pages yield no clean pool accounts. */
const MAX_POOL_LIST_PAGES = 10;

export const POOL_TAG = "autumn_tw_pool";
export const POOL_STATE_TAG = "autumn_tw_pool_state";
export const NUKING_AT_TAG = "autumn_tw_nuking_at";
/** A `nuking` account older than this is a crashed nuke, not one worth waiting on. */
export const NUKE_IN_PROGRESS_WINDOW_MS = 10 * 60 * 1000;
/** Give a prior run's in-flight nuke this long to free clean accounts, then top-up-create. */
const TEARDOWN_WAIT_TIMEOUT_MS = 4 * 60 * 1000;
const TEARDOWN_WAIT_POLL_MS = 10_000;

/** Whether a `nuking` account's timestamp marks a live (recent) nuke. */
export const isNukeInProgress = (nukingAtRaw: string | undefined): boolean => {
	const nukingAt = Number(nukingAtRaw);
	return (
		Number.isFinite(nukingAt) &&
		Date.now() - nukingAt < NUKE_IN_PROGRESS_WINDOW_MS
	);
};

/** Metadata patch marking a pooled account claimed by this run. */
const dirtyPatch = (owner: string, runId: string): Record<string, string> => ({
	[POOL_TAG]: "1",
	[POOL_STATE_TAG]: "dirty",
	autumn_tw_owner: owner,
	autumn_tw_run: runId,
	autumn_tw_claimed_at: String(Date.now()),
});

/**
 * Scan one key's pool: clean account ids (newest-first, up to `want`) plus how
 * many accounts a live nuke currently holds (`nuking` with a recent timestamp).
 */
const scanPoolAccounts = async (
	keyIndex: number,
	want: number,
): Promise<{ clean: string[]; nukingInProgress: number }> => {
	const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));
	const clean: string[] = [];
	let nukingInProgress = 0;
	let scanned = 0;
	for await (const account of stripe.accounts.list({ limit: POOL_LIST_PAGE })) {
		const metadata = account.metadata as Record<string, string> | null;
		if (metadata?.[POOL_TAG] === "1") {
			const state = metadata?.[POOL_STATE_TAG];
			if (state === "clean") {
				clean.push(account.id);
				if (clean.length >= want) {
					break;
				}
			} else if (
				state === "nuking" &&
				isNukeInProgress(metadata?.[NUKING_AT_TAG])
			) {
				nukingInProgress++;
			}
		}
		// Newest-first and pool accounts are recent; cap the scan so a huge
		// legacy platform account can't stall the claim.
		scanned++;
		if (scanned >= MAX_POOL_LIST_PAGES * POOL_LIST_PAGE) {
			break;
		}
	}
	return { clean, nukingInProgress };
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Clean accounts for one key, WAITING on a prior run's in-flight nuke when the
 * pool is short (those accounts flip back to clean in seconds-to-minutes, and
 * top-up-creating instead would grow the pool for nothing). Falls through to
 * the shortfall-create path after the timeout or when no nuke is live.
 */
const listCleanAccountsWaitingForNuke = async (
	keyIndex: number,
	want: number,
	log: (line: string) => void,
): Promise<string[]> => {
	const deadline = Date.now() + TEARDOWN_WAIT_TIMEOUT_MS;
	let waited = false;
	for (;;) {
		const { clean, nukingInProgress } = await scanPoolAccounts(keyIndex, want);
		if (clean.length >= want || nukingInProgress === 0) {
			if (waited) {
				log(
					`stripe pool (key ${keyIndex}): teardown wait over — ${clean.length}/${want} clean, ${nukingInProgress} still nuking`,
				);
			}
			return clean;
		}
		if (Date.now() >= deadline) {
			log(
				`stripe pool (key ${keyIndex}): gave up waiting on the previous teardown (${clean.length}/${want} clean) — creating the shortfall`,
			);
			return clean;
		}
		waited = true;
		log(
			`stripe pool (key ${keyIndex}): waiting for previous teardown… (${clean.length}/${want} clean, ${nukingInProgress} nuking)`,
		);
		await sleep(TEARDOWN_WAIT_POLL_MS);
	}
};

export type PoolCensus = {
	keyIndex: number;
	clean: number;
	dirty: number;
	/** `nuking` accounts with a live (recent) timestamp — a teardown in flight. */
	nukingInProgress: number;
	/** `nuking` accounts with a stale/absent timestamp — a crashed nuke. */
	nukingStale: number;
	/** Epoch-ms of the oldest live nuke, when any. */
	oldestNukingAt?: number;
};

/** Per-key pool state tally (for `bun tw doctor`). Capped scan, read-only. */
export const poolCensus = async (
	maxPages = MAX_POOL_LIST_PAGES,
): Promise<PoolCensus[]> =>
	Promise.all(
		allPoolKeys().map(async (key, keyIndex) => {
			const stripe = stripeClientForKey(key);
			const census: PoolCensus = {
				keyIndex,
				clean: 0,
				dirty: 0,
				nukingInProgress: 0,
				nukingStale: 0,
			};
			let scanned = 0;
			for await (const account of stripe.accounts.list({
				limit: POOL_LIST_PAGE,
			})) {
				const metadata = account.metadata as Record<string, string> | null;
				if (metadata?.[POOL_TAG] === "1") {
					const state = metadata?.[POOL_STATE_TAG];
					if (state === "clean") {
						census.clean++;
					} else if (state === "dirty") {
						census.dirty++;
					} else if (state === "nuking") {
						if (isNukeInProgress(metadata?.[NUKING_AT_TAG])) {
							census.nukingInProgress++;
							const at = Number(metadata?.[NUKING_AT_TAG]);
							if (!census.oldestNukingAt || at < census.oldestNukingAt) {
								census.oldestNukingAt = at;
							}
						} else {
							census.nukingStale++;
						}
					}
				}
				scanned++;
				if (scanned >= maxPages * POOL_LIST_PAGE) {
					break;
				}
			}
			return census;
		}),
	);

export type ClaimResult = {
	/** Worker idx → encoded `acct_*::keyIndex`, key-aligned with stripeKeyForWorker. */
	byWorker: string[];
	reused: number;
	created: number;
};

/**
 * Claim `count` accounts (one per worker idx, on that idx's round-robin key):
 * reuse clean pool accounts first, create tagged ones for the shortfall. Marks
 * every claimed account dirty BEFORE returning (crash-safe: a dead run leaves
 * dirty accounts, which the next teardown's stale sweep re-nukes).
 *
 * MUST be called under the `stripe-pool` global lock.
 */
export const claimPoolAccounts = async ({
	count,
	owner,
	runId,
	ownerEmail,
	orgId,
	orgNameForIdx,
	log = () => {},
}: {
	count: number;
	ownerEmail: string;
	orgId: string;
	orgNameForIdx: (idx: number) => string;
	log?: (line: string) => void;
} & OwnerTag): Promise<ClaimResult> => {
	// Workers per key, mirroring stripeKeyForWorker's round-robin.
	const idxByKey = new Map<number, number[]>();
	for (let idx = 0; idx < count; idx++) {
		const { keyIndex } = stripeKeyForWorker(idx);
		const list = idxByKey.get(keyIndex) ?? [];
		list.push(idx);
		idxByKey.set(keyIndex, list);
	}

	const byWorker: string[] = new Array(count);
	let reused = 0;
	let created = 0;
	const limit = pLimit(CLAIM_CONCURRENCY);

	await Promise.all(
		[...idxByKey.entries()].map(async ([keyIndex, idxs]) => {
			const clean = await listCleanAccountsWaitingForNuke(
				keyIndex,
				idxs.length,
				log,
			);
			const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));

			await Promise.all(
				idxs.map((idx, position) =>
					limit(async () => {
						const existing = clean[position];
						if (existing) {
							await stripe.accounts.update(existing, {
								metadata: dirtyPatch(owner, runId),
							});
							byWorker[idx] = encodeSubAccount(existing, keyIndex);
							reused++;
							return;
						}
						const accountId = await createSandboxSubAccount({
							orgName: orgNameForIdx(idx),
							ownerEmail,
							owner,
							runId,
							orgId,
							secretKey: stripeKeyByIndex(keyIndex),
							extraMetadata: dirtyPatch(owner, runId),
						});
						byWorker[idx] = encodeSubAccount(accountId, keyIndex);
						created++;
					}),
				),
			);
		}),
	);

	return { byWorker, reused, created };
};
