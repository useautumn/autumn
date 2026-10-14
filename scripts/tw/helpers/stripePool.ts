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
import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "./stripeRequestBudget.js";

const CLAIM_CONCURRENCY_PER_KEY = 4;
const POOL_LIST_PAGE = 100;
const MAX_POOL_LIST_PAGES = 10;
const FIRST_PAGE_HEADROOM = 5;

export const POOL_TAG = "autumn_tw_pool";
export const POOL_STATE_TAG = "autumn_tw_pool_state";
export const NUKING_AT_TAG = "autumn_tw_nuking_at";
export const NUKE_IN_PROGRESS_WINDOW_MS = 10 * 60 * 1000;
const TEARDOWN_WAIT_TIMEOUT_MS = 4 * 60 * 1000;
const TEARDOWN_WAIT_POLL_MS = 10_000;

export const isNukeInProgress = (nukingAtRaw: string | undefined): boolean => {
	const nukingAt = Number(nukingAtRaw);
	return (
		Number.isFinite(nukingAt) &&
		Date.now() - nukingAt < NUKE_IN_PROGRESS_WINDOW_MS
	);
};

const dirtyPatch = (owner: string, runId: string): Record<string, string> => ({
	[POOL_TAG]: "1",
	[POOL_STATE_TAG]: "dirty",
	autumn_tw_owner: owner,
	autumn_tw_run: runId,
	autumn_tw_claimed_at: String(Date.now()),
});

const scanPoolAccounts = async (
	keyIndex: number,
	want: number,
): Promise<{ clean: string[]; nukingInProgress: number }> => {
	const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));
	const clean: string[] = [];
	let nukingInProgress = 0;
	let scanned = 0;
	let startingAfter: string | undefined;
	while (scanned < MAX_POOL_LIST_PAGES * POOL_LIST_PAGE) {
		const limit =
			scanned === 0
				? Math.min(POOL_LIST_PAGE, want + FIRST_PAGE_HEADROOM)
				: POOL_LIST_PAGE;
		const page = await withStripeRequestSlot(() =>
			stripe.accounts.list(
				{ limit, starting_after: startingAfter },
				STRIPE_REQUEST_OPTIONS,
			),
		);
		for (const account of page.data) {
			scanned++;
			const metadata = account.metadata as Record<string, string> | null;
			if (metadata?.[POOL_TAG] !== "1") {
				continue;
			}
			const state = metadata?.[POOL_STATE_TAG];
			if (state === "clean") {
				clean.push(account.id);
				if (clean.length >= want) {
					return { clean, nukingInProgress };
				}
			} else if (
				state === "nuking" &&
				isNukeInProgress(metadata?.[NUKING_AT_TAG])
			) {
				nukingInProgress++;
			}
		}
		const lastAccount = page.data.at(-1);
		if (!page.has_more || !lastAccount) {
			break;
		}
		startingAfter = lastAccount.id;
	}
	return { clean, nukingInProgress };
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

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
	nukingInProgress: number;
	nukingStale: number;
	oldestNukingAt?: number;
};

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
	byWorker: string[];
	reused: number;
	created: number;
};

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
	await Promise.all(
		[...idxByKey.entries()].map(async ([keyIndex, idxs]) => {
			const limit = pLimit(CLAIM_CONCURRENCY_PER_KEY);
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
							await withStripeRequestSlot(() =>
								stripe.accounts.update(
									existing,
									{ metadata: dirtyPatch(owner, runId) },
									STRIPE_REQUEST_OPTIONS,
								),
							);
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
