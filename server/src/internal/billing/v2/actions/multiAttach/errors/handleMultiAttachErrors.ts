import type { BillingPlan, MultiAttachBillingContext } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleRevertTrialErrors } from "@/internal/billing/v2/actions/attach/errors/handleRevertTrialErrors";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
import { handleSubscriptionIdErrors } from "@/internal/billing/v2/common/errors/handleSubscriptionIdErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { handleMultiAttachCurrentProductErrors } from "./handleMultiAttachCurrentProductErrors";
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

	handleMultiAttachRedirectErrors({
		redirectMode,
		stripeSubscription: billingContext.stripeSubscription,
	});

	handleRevertTrialErrors({ billingContext });

	// Subscription ID uniqueness
	await handleSubscriptionIdErrors({
		db,
		internalCustomerId: billingContext.fullCustomer.internal_id,
		subscriptionIds: billingContext.productContexts.map((pc) => pc.externalId),
	});
};

export const handleMultiAttachBillingPlanErrors = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
	billingPlan: BillingPlan;
}) => {
	handleProrationBehaviorErrors({ billingContext, billingPlan });
	handleStripeBillingPlanErrors({ ctx, billingContext, billingPlan });
};
