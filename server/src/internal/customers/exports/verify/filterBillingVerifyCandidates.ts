import { notNullish } from "@autumn/shared";
import { dbReplica } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getSharedStripeCustomerIds,
	getStripeLinkedCustomerIds,
} from "../queries/getBillingVerifyCandidates.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import type { BillingVerifySweep } from "./setupBillingVerifySweep.js";

/** A customer with no Stripe subscription, no Stripe-linked
 * plan and no shared Stripe id has nothing to verify, so it is never loaded. */
export const filterBillingVerifyCandidates = async ({
	ctx,
	scalars,
	sweep,
}: {
	ctx: AutumnContext;
	scalars: CustomerExportScalarRow[];
	sweep: BillingVerifySweep;
}): Promise<CustomerExportScalarRow[]> => {
	const onStripe = scalars.filter((scalar) => scalar.processor?.id);
	const { sweptSubscriptions } = sweep;

	const db = dbReplica ?? ctx.db;
	const [linkedCustomerIds, sharedStripeCustomerIds] = await Promise.all([
		getStripeLinkedCustomerIds({
			db,
			internalCustomerIds: onStripe.map((scalar) => scalar.internal_id),
		}),
		getSharedStripeCustomerIds({
			db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeCustomerIds: onStripe
				.map((scalar) => scalar.processor?.id)
				.filter(notNullish),
		}),
	]);

	return onStripe.filter((scalar) => {
		const stripeCustomerId = scalar.processor?.id ?? "";
		return (
			sweptSubscriptions.has(stripeCustomerId) ||
			linkedCustomerIds.has(scalar.internal_id) ||
			sharedStripeCustomerIds.has(stripeCustomerId)
		);
	});
};
