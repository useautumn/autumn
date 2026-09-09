import type {
	BillingPlan,
	MultiAttachBillingContext,
	MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleRevertTrialErrors } from "@/internal/billing/v2/actions/attach/errors/handleRevertTrialErrors";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
import { handlePendingPlanConflictErrors } from "@/internal/billing/v2/common/errors/handlePendingPlanConflictErrors";
import { handleSubscriptionIdErrors } from "@/internal/billing/v2/common/errors/handleSubscriptionIdErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { handleMultiAttachBillingCycleAnchorErrors } from "./handleMultiAttachBillingCycleAnchorErrors";
import { handleMultiAttachCurrentProductErrors } from "./handleMultiAttachCurrentProductErrors";
import { handleMultiAttachRedirectErrors } from "./handleMultiAttachRedirectErrors";
import { handleMultiAttachStartDateErrors } from "./handleMultiAttachStartDateErrors";

/** Runs all multi-attach validation checks. */
export const handleMultiAttachErrors = async ({
	ctx,
	billingContext,
	redirectMode,
	params,
	preview,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
	redirectMode: string;
	params: MultiAttachParamsV0;
	preview: boolean;
}) => {
	handleMultiAttachStartDateErrors({ billingContext, params });

	handleMultiAttachCurrentProductErrors({
		productContexts: billingContext.productContexts,
	});

	for (const productContext of billingContext.productContexts) {
		await handlePendingPlanConflictErrors({
			ctx,
			fullCustomer: productContext.fullCustomer,
			attachProduct: productContext.fullProduct,
			preview,
		});
	}

	handleMultiAttachRedirectErrors({
		redirectMode,
		stripeSubscription: billingContext.stripeSubscription,
	});

	handleRevertTrialErrors({ billingContext });

	handleMultiAttachBillingCycleAnchorErrors({ billingContext });

	// Subscription ID uniqueness
	await handleSubscriptionIdErrors({
		db: ctx.db,
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
