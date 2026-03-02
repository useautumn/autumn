import type { MultiAttachBillingContext } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import { handleSubscriptionIdErrors } from "@/internal/billing/v2/common/errors/handleSubscriptionIdErrors";
import { handleMultiAttachCurrentProductErrors } from "./handleMultiAttachCurrentProductErrors";
import { handleMultiAttachPrepaidErrors } from "./handleMultiAttachPrepaidErrors";
import { handleMultiAttachRedirectErrors } from "./handleMultiAttachRedirectErrors";

/** Runs all multi-attach validation checks. */
export const handleMultiAttachErrors = async ({
	db,
	billingContext,
	redirectMode,
}: {
	db: DrizzleCli;
	billingContext: MultiAttachBillingContext;
	redirectMode: string;
}) => {
	handleMultiAttachCurrentProductErrors({
		productContexts: billingContext.productContexts,
	});

	handleMultiAttachPrepaidErrors({
		productContexts: billingContext.productContexts,
	});

	handleMultiAttachRedirectErrors({
		redirectMode,
		stripeSubscription: billingContext.stripeSubscription,
	});

	// Subscription ID uniqueness
	await handleSubscriptionIdErrors({
		db,
		internalCustomerId: billingContext.fullCustomer.internal_id,
		subscriptionIds: billingContext.productContexts.map(
			(pc) => pc.externalId,
		),
	});
};
