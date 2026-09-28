import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import pLimit from "p-limit";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { enqueueNukeJobs } from "../../accounts/actions/enqueueNukeJobs.ts";
import { knownKeySecrets } from "../keySecrets.ts";
import { POOL_STATE_TAG, POOL_TAG, stripeForKey } from "../stripeForKey.ts";

const PAGE_SIZE = 100;
/** Same cap as scripts/tw/helpers/stripePool.ts: pool accounts are recent and list first. */
const MAX_PAGES = 10;
const KEY_CONCURRENCY = 8;

/** Import legacy `bun tw` pool accounts (metadata autumn_tw_pool=1) into the ledger; dirty ones get nuked. */
export const discoverPoolAccounts = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<{ discovered: number; nuking: number }> => {
	let discovered = 0;
	const toNuke: string[] = [];
	const limit = pLimit(KEY_CONCURRENCY);
	await Promise.all(
		knownKeySecrets().map(({ platformAccountId, secret }) =>
			limit(async () => {
				const stripe = stripeForKey({ secret });
				let startingAfter: string | undefined;
				for (let page = 0; page < MAX_PAGES; page++) {
					const listing = await withStripeRequestSlot(() =>
						stripe.accounts.list(
							{ limit: PAGE_SIZE, starting_after: startingAfter },
							STRIPE_REQUEST_OPTIONS,
						),
					);
					const rows = listing.data
						.filter((account) => account.metadata?.[POOL_TAG] === "1")
						.map((account) => ({
							id: account.id,
							platformAccountId,
							state:
								account.metadata?.[POOL_STATE_TAG] === "clean"
									? ("clean" as const)
									: ("nuking" as const),
						}));
					if (rows.length > 0) {
						const inserted = await ctx.db
							.insert(stripeAccounts)
							.values(rows)
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
					}
					const last = listing.data.at(-1);
					if (!listing.has_more || !last) break;
					startingAfter = last.id;
				}
			}),
		),
	);
	await enqueueNukeJobs({ ctx, accountIds: toNuke });
	ctx.logger.info("twd pool discovery", { discovered, nuking: toNuke.length });
	return { discovered, nuking: toNuke.length };
};
