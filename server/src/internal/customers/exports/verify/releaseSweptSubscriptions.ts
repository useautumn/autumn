import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import type { BillingVerifySweep } from "./setupBillingVerifySweep.js";

/** The walk is a forward keyset scan, so a page's subscriptions are unreachable
 * once it is verified — except under a Stripe id shared with a customer on a
 * later page, which still has to find them. */
export const releaseSweptSubscriptions = ({
	sweep,
	scalars,
	sharedStripeCustomerIds,
}: {
	sweep: BillingVerifySweep;
	scalars: CustomerExportScalarRow[];
	sharedStripeCustomerIds: Set<string>;
}) => {
	for (const scalar of scalars) {
		const stripeCustomerId = scalar.processor?.id;
		if (!stripeCustomerId) continue;
		if (sharedStripeCustomerIds.has(stripeCustomerId)) continue;
		sweep.sweptSubscriptions.delete(stripeCustomerId);
	}
};
