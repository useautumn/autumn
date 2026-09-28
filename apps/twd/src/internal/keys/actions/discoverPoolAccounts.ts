import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { inArray } from "drizzle-orm";
import pLimit from "p-limit";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { enqueueNukeJobs } from "../../accounts/actions/enqueueNukeJobs.ts";
import { knownKeySecrets } from "../keySecrets.ts";
import { fullNukeLocked } from "../repos/fullNukeLockRepo.ts";
import { describeStripeError, isAccountGone } from "../stripeErrors.ts";
import {
	LEGACY_POOL_STATE_TAG,
	LEGACY_POOL_TAG,
	stripeForKey,
	TWD_POOL_TAG,
	TWD_STATE_TAG,
} from "../stripeForKey.ts";
import { setTwdPoolState } from "./setTwdPoolState.ts";

const PAGE_SIZE = 100;
/** Same cap as scripts/tw/helpers/stripePool.ts: pool accounts are recent and list first. */
const MAX_PAGES = 10;
const KEY_CONCURRENCY = 8;
const RETAG_CONCURRENCY = 4;

/** Adopt accounts tagged autumn_twd_pool=1 or legacy autumn_tw_pool=1; legacy ones are re-tagged twd, dirty ones nuked. */
export const discoverPoolAccounts = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<{ discovered: number; nuking: number; retagged: number }> => {
	const locked = new Set(
		(
			await ctx.db
				.select({ platformAccountId: stripeKeys.platformAccountId })
				.from(stripeKeys)
				.where(fullNukeLocked)
		).map((row) => row.platformAccountId),
	);
	let discovered = 0;
	let retagged = 0;
	const toNuke: string[] = [];
	const limit = pLimit(KEY_CONCURRENCY);
	await Promise.all(
		knownKeySecrets()
			.filter(({ platformAccountId }) => !locked.has(platformAccountId))
			.map(({ platformAccountId, secret }) =>
				limit(async () => {
					const stripe = stripeForKey({ secret });
					const retagLimit = pLimit(RETAG_CONCURRENCY);
					let startingAfter: string | undefined;
					for (let page = 0; page < MAX_PAGES; page++) {
						const listing = await withStripeRequestSlot(() =>
							stripe.accounts.list(
								{ limit: PAGE_SIZE, starting_after: startingAfter },
								STRIPE_REQUEST_OPTIONS,
							),
						);
						const pool = listing.data.flatMap((account) => {
							const metadata = account.metadata ?? {};
							if (metadata[TWD_POOL_TAG] === "1") {
								return [
									{ account, legacy: false, state: metadata[TWD_STATE_TAG] },
								];
							}
							if (metadata[LEGACY_POOL_TAG] === "1") {
								return [
									{
										account,
										legacy: true,
										state: metadata[LEGACY_POOL_STATE_TAG],
									},
								];
							}
							return [];
						});
						if (pool.length > 0) {
							const inserted = await ctx.db
								.insert(stripeAccounts)
								.values(
									pool.map(({ account, state }) => ({
										id: account.id,
										platformAccountId,
										state:
											state === "clean"
												? ("clean" as const)
												: ("nuking" as const),
									})),
								)
								.onConflictDoNothing()
								.returning({
									id: stripeAccounts.id,
									state: stripeAccounts.state,
								});
							discovered += inserted.length;
							toNuke.push(
								...inserted
									.filter((row) => row.state === "nuking")
									.map((row) => row.id),
							);
							const legacyIds = pool
								.filter((entry) => entry.legacy)
								.map(({ account }) => account.id);
							const ledger = legacyIds.length
								? await ctx.db
										.select({
											id: stripeAccounts.id,
											state: stripeAccounts.state,
										})
										.from(stripeAccounts)
										.where(inArray(stripeAccounts.id, legacyIds))
								: [];
							await Promise.all(
								ledger.map((row) =>
									retagLimit(async () => {
										const entry = pool.find(
											({ account }) => account.id === row.id,
										);
										try {
											await setTwdPoolState({
												secret,
												accountId: row.id,
												state: row.state === "clean" ? "clean" : "nuking",
												existing: entry?.account.metadata ?? {},
											});
											retagged++;
										} catch (error) {
											if (!isAccountGone(error)) throw error;
											ctx.logger.warn(
												"twd discovery: account vanished while re-tagging",
												{
													accountId: row.id,
													platformAccountId,
													error: describeStripeError(error),
												},
											);
										}
									}),
								),
							);
						}
						const last = listing.data.at(-1);
						if (!listing.has_more || !last) break;
						startingAfter = last.id;
					}
				}),
			),
	);
	await enqueueNukeJobs({ ctx, accountIds: toNuke });
	ctx.logger.info("twd pool discovery", {
		discovered,
		nuking: toNuke.length,
		retagged,
	});
	return { discovered, nuking: toNuke.length, retagged };
};
