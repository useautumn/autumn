import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import type { BillingVerifySweep } from "./setupBillingVerifySweep.js";

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
