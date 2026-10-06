import { dbReplica } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLinkedStripeCustomerIds } from "../../queries/getBillingVerifyCandidates.js";
import { retryExportDbRead } from "../retryExportDbRead.js";
import type { BillingVerifySweep } from "../setupBillingVerifySweep.js";
import { isBilledSubscription } from "./orphanToExportRow.js";
import { toLookupBatches } from "./toLookupBatches.js";

/** Checked against every customer in the org, not the walked population, so a
 * customer created mid-run or linked under a shared id is never reported. */
export const findUnlinkedStripeCustomerIds = async ({
	ctx,
	sweep,
}: {
	ctx: AutumnContext;
	sweep: BillingVerifySweep;
}): Promise<string[]> => {
	const billedStripeCustomerIds = [...sweep.sweptSubscriptions]
		.filter(([, subscriptions]) => subscriptions.some(isBilledSubscription))
		.map(([stripeCustomerId]) => stripeCustomerId);

	const readLinkedStripeCustomerIds = retryExportDbRead({
		logger: ctx.logger,
		operation: "getLinkedStripeCustomerIds",
		query: getLinkedStripeCustomerIds,
	});

	const unlinked: string[] = [];
	for (const batch of toLookupBatches(billedStripeCustomerIds)) {
		const linked = await readLinkedStripeCustomerIds({
			db: dbReplica ?? ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeCustomerIds: batch,
		});
		unlinked.push(...batch.filter((id) => !linked.has(id)));
	}
	return unlinked;
};
