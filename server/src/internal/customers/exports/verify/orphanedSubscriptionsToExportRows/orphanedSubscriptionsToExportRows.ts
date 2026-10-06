import {
	AppEnv,
	type BillingVerifyExportRow,
	notNullish,
} from "@autumn/shared";
import { dbReplica } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { createRatePacer, type RatePacer } from "@/utils/createRatePacer.js";
import { billingVerifyExportConfig } from "../billingVerifyExportConfig.js";
import type { BillingVerifySweep } from "../setupBillingVerifySweep.js";
import { findPossibleMatches } from "./findPossibleMatches.js";
import { findUnlinkedStripeCustomerIds } from "./findUnlinkedStripeCustomerIds.js";
import {
	failedOrphanToExportRow,
	isBilledSubscription,
	type OrphanedStripeCustomer,
	orphanToExportRow,
} from "./orphanToExportRow.js";
import { readOrphanedStripeCustomer } from "./readOrphanedStripeCustomer.js";
import { toBatches } from "./toBatches.js";

type OrphanRead =
	| { orphan: OrphanedStripeCustomer | null }
	| { failedRow: BillingVerifyExportRow };

const sweptBilledStripeCustomerIds = ({
	sweep,
}: {
	sweep: BillingVerifySweep;
}) =>
	[...sweep.sweptSubscriptions]
		.filter(([, subscriptions]) => subscriptions.some(isBilledSubscription))
		.map(([stripeCustomerId]) => stripeCustomerId);

const readOrphans = ({
	ctx,
	sweep,
	pacer,
	stripeCustomerIds,
}: {
	ctx: AutumnContext;
	sweep: BillingVerifySweep;
	pacer: RatePacer;
	stripeCustomerIds: string[];
}) =>
	mapWithConcurrency({
		items: stripeCustomerIds,
		concurrency: billingVerifyExportConfig.orphans.concurrency,
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

const orphanBatchToExportRows = async ({
	ctx,
	sweep,
	pacer,
	stripeCustomerIds,
}: {
	ctx: AutumnContext;
	sweep: BillingVerifySweep;
	pacer: RatePacer;
	stripeCustomerIds: string[];
}): Promise<BillingVerifyExportRow[]> => {
	const reads = await readOrphans({ ctx, sweep, pacer, stripeCustomerIds });
	const orphans = reads
		.map((read) => ("orphan" in read ? read.orphan : null))
		.filter(notNullish);
	const failedRows = reads
		.map((read) => ("failedRow" in read ? read.failedRow : null))
		.filter(notNullish);

	// The replica can lag a link made during the run, so the primary has the final say.
	const unlinkedOnPrimary = new Set(
		await findUnlinkedStripeCustomerIds({
			ctx,
			db: ctx.db,
			stripeCustomerIds: orphans.map((orphan) => orphan.stripeCustomerId),
		}),
	);
	const confirmedOrphans = orphans.filter((orphan) =>
		unlinkedOnPrimary.has(orphan.stripeCustomerId),
	);
	const possibleMatches = await findPossibleMatches({
		ctx,
		orphans: confirmedOrphans,
	});

	return [
		...confirmedOrphans.map((orphan) =>
			orphanToExportRow({
				orphan,
				possibleMatchIds:
					possibleMatches.get(orphan.email?.toLowerCase() ?? "") ?? [],
			}),
		),
		...failedRows,
	];
};

/** Run after the walk: whatever the sweep still holds belongs to a Stripe
 * customer no walked Autumn customer pointed at. Yields one batch of rows at a time. */
export const orphanedSubscriptionsToExportRows = async function* ({
	ctx,
	sweep,
}: {
	ctx: AutumnContext;
	sweep: BillingVerifySweep;
}): AsyncGenerator<BillingVerifyExportRow[]> {
	const { requestsPerSecond, sandboxRequestsPerSecond, rowBatchSize } =
		billingVerifyExportConfig.orphans;
	const pacer = createRatePacer({
		requestsPerSecond:
			ctx.env === AppEnv.Sandbox ? sandboxRequestsPerSecond : requestsPerSecond,
	});

	const unlinkedOnReplica = await findUnlinkedStripeCustomerIds({
		ctx,
		db: dbReplica ?? ctx.db,
		stripeCustomerIds: sweptBilledStripeCustomerIds({ sweep }),
	});

	for (const stripeCustomerIds of toBatches({
		items: unlinkedOnReplica,
		size: rowBatchSize,
	})) {
		yield await orphanBatchToExportRows({
			ctx,
			sweep,
			pacer,
			stripeCustomerIds,
		});
	}
};
