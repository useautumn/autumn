import { notNullish } from "@autumn/shared";
import { dbReplica } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getSharedStripeCustomerIds,
	getStripeLinkedCustomerIds,
	getUnlinkedPaidPlanCustomerIds,
} from "../queries/getBillingVerifyCandidates.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import { retryExportDbRead } from "./retryExportDbRead.js";
import type { BillingVerifySweep } from "./setupBillingVerifySweep.js";

/** A customer with no Stripe subscription, no Stripe-linked plan, no paid plan
 * missing its subscription and no shared Stripe id has nothing to verify, so
 * it is never loaded. A paid plan attached without billing may have no Stripe
 * customer at all, so that check runs over every customer. */
export const filterBillingVerifyCandidates = async ({
	ctx,
	scalars,
	sweep,
}: {
	ctx: AutumnContext;
	scalars: CustomerExportScalarRow[];
	sweep: BillingVerifySweep;
}): Promise<{
	candidates: CustomerExportScalarRow[];
	sharedStripeCustomerIds: Set<string>;
}> => {
	const onStripe = scalars.filter((scalar) => scalar.processor?.id);
	const { sweptSubscriptions } = sweep;

	const db = dbReplica ?? ctx.db;
	const { logger } = ctx;
	const readLinkedCustomerIds = retryExportDbRead({
		logger,
		operation: "getStripeLinkedCustomerIds",
		query: getStripeLinkedCustomerIds,
	});
	const readUnlinkedPaidPlanCustomerIds = retryExportDbRead({
		logger,
		operation: "getUnlinkedPaidPlanCustomerIds",
		query: getUnlinkedPaidPlanCustomerIds,
	});
	const readSharedStripeCustomerIds = retryExportDbRead({
		logger,
		operation: "getSharedStripeCustomerIds",
		query: getSharedStripeCustomerIds,
	});

	const [
		linkedCustomerIds,
		unlinkedPaidPlanCustomerIds,
		sharedStripeCustomerIds,
	] = await Promise.all([
		readLinkedCustomerIds({
			db,
			internalCustomerIds: onStripe.map((scalar) => scalar.internal_id),
		}),
		readUnlinkedPaidPlanCustomerIds({
			db,
			internalCustomerIds: scalars.map((scalar) => scalar.internal_id),
		}),
		readSharedStripeCustomerIds({
			db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeCustomerIds: onStripe
				.map((scalar) => scalar.processor?.id)
				.filter(notNullish),
		}),
	]);

	const candidates = scalars.filter((scalar) => {
		if (unlinkedPaidPlanCustomerIds.has(scalar.internal_id)) return true;
		const stripeCustomerId = scalar.processor?.id;
		if (!stripeCustomerId) return false;
		return (
			sweptSubscriptions.has(stripeCustomerId) ||
			linkedCustomerIds.has(scalar.internal_id) ||
			sharedStripeCustomerIds.has(stripeCustomerId)
		);
	});

	return { candidates, sharedStripeCustomerIds };
};
