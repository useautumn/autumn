import {
	AppEnv,
	type BillingVerifyExportRow,
	notNullish,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { createRatePacer } from "@/utils/createRatePacer.js";
import { billingVerifyExportConfig } from "../billingVerifyExportConfig.js";
import type { BillingVerifySweep } from "../setupBillingVerifySweep.js";
import { findPossibleMatches } from "./findPossibleMatches.js";
import { findUnlinkedStripeCustomerIds } from "./findUnlinkedStripeCustomerIds.js";
import {
	failedOrphanToExportRow,
	type OrphanedStripeCustomer,
	orphanToExportRow,
} from "./orphanToExportRow.js";
import { readOrphanedStripeCustomer } from "./readOrphanedStripeCustomer.js";

type OrphanRead =
	| { orphan: OrphanedStripeCustomer | null }
	| { failedRow: BillingVerifyExportRow };

/** Run after the walk: whatever the sweep still holds belongs to a Stripe
 * customer no walked Autumn customer pointed at. */
export const orphanedSubscriptionsToExportRows = async ({
	ctx,
	sweep,
}: {
	ctx: AutumnContext;
	sweep: BillingVerifySweep;
}): Promise<BillingVerifyExportRow[]> => {
	const { concurrency, requestsPerSecond, sandboxRequestsPerSecond } =
		billingVerifyExportConfig.orphans;
	const pacer = createRatePacer({
		requestsPerSecond:
			ctx.env === AppEnv.Sandbox ? sandboxRequestsPerSecond : requestsPerSecond,
	});

	const unlinkedStripeCustomerIds = await findUnlinkedStripeCustomerIds({
		ctx,
		sweep,
	});

	const reads = await mapWithConcurrency({
		items: unlinkedStripeCustomerIds,
		concurrency,
		run: async (stripeCustomerId): Promise<OrphanRead> => {
			try {
				const orphan = await readOrphanedStripeCustomer({
					ctx,
					stripeCli: sweep.stripeReader,
					stripeCustomerId,
					pacer,
				});
				return { orphan };
			} catch (error) {
				return {
					failedRow: failedOrphanToExportRow({ stripeCustomerId, error }),
				};
			}
		},
	});

	const orphans = reads
		.map((read) => ("orphan" in read ? read.orphan : null))
		.filter(notNullish);
	const failedRows = reads
		.map((read) => ("failedRow" in read ? read.failedRow : null))
		.filter(notNullish);

	const possibleMatches = await findPossibleMatches({ ctx, orphans });

	return [
		...orphans.map((orphan) =>
			orphanToExportRow({
				orphan,
				possibleMatchIds:
					possibleMatches.get(orphan.email?.toLowerCase() ?? "") ?? [],
			}),
		),
		...failedRows,
	];
};
