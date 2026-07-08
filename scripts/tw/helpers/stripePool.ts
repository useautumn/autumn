/**
 * Persistent Stripe sub-account POOL for the swarm.
 *
 * Pool state lives IN Stripe (no local file is authoritative): every pooled
 * sub-account carries `metadata.autumn_tw_pool="1"` and
 * `metadata.autumn_tw_pool_state=clean|dirty`. A run CLAIMS clean accounts
 * (list newest-first + mark dirty), tops up by creating tagged accounts for any
 * shortfall, and at teardown a detached sandbox NUKES contents and flips the
 * state back to clean (scripts/tw/image/nuke-accounts.mjs).
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

/** Metadata patch marking a pooled account claimed by this run. */
const dirtyPatch = (owner: string, runId: string): Record<string, string> => ({
	[POOL_TAG]: "1",
	[POOL_STATE_TAG]: "dirty",
	autumn_tw_owner: owner,
	autumn_tw_run: runId,
	autumn_tw_claimed_at: String(Date.now()),
});

/** List clean pool accounts under one key, newest-first, up to `want`. */
const listCleanAccounts = async (
	keyIndex: number,
	want: number,
): Promise<string[]> => {
	const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));
	const clean: string[] = [];
	let scanned = 0;
	for await (const account of stripe.accounts.list({ limit: POOL_LIST_PAGE })) {
		const metadata = account.metadata as Record<string, string> | null;
		if (
			metadata?.[POOL_TAG] === "1" &&
			metadata?.[POOL_STATE_TAG] === "clean"
		) {
			clean.push(account.id);
			if (clean.length >= want) {
				break;
			}
		}
		// Newest-first and pool accounts are recent; cap the scan so a huge
		// legacy platform account can't stall the claim.
		scanned++;
		if (scanned >= MAX_POOL_LIST_PAGES * POOL_LIST_PAGE) {
			break;
		}
	}
	return clean;
};

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
}: {
	count: number;
	ownerEmail: string;
	orgId: string;
	orgNameForIdx: (idx: number) => string;
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
			const clean = await listCleanAccounts(keyIndex, idxs.length);
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
