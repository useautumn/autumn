import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleUpdateSubscriptionErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleUpdateSubscriptionErrors";
import { handleUnsupportedLicenseActionErrors } from "@/internal/billing/v2/common/errors/handleUnsupportedLicenseActionErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import type { MultiUpdateItemResult } from "../compute/computeMultiUpdateFold";
import type { MultiUpdateStripeBillingPlan } from "../evaluate/evaluateMultiUpdateStripe";

export const handleMultiUpdateErrors = async ({
	ctx,
	itemResults,
	stripeBillingPlans,
}: {
	ctx: AutumnContext;
	itemResults: MultiUpdateItemResult[];
	stripeBillingPlans: MultiUpdateStripeBillingPlan[];
}) => {
	for (const itemResult of itemResults) {
		handleUnsupportedLicenseActionErrors({
			actionLabel: "billing.multi_update",
			fullProducts: itemResult.billingContext.fullProducts,
			customerProducts: [itemResult.billingContext.customerProduct],
		});

		await handleUpdateSubscriptionErrors({
			ctx,
			billingContext: itemResult.billingContext,
			billingPlan: {
				autumn: itemResult.itemPlan,
				stripe: {},
			},
			params: itemResult.params,
		});
	}

	for (const subscriptionPlan of stripeBillingPlans) {
		handleStripeBillingPlanErrors({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			billingPlan: {
				autumn: subscriptionPlan.autumnBillingPlan,
				stripe: subscriptionPlan.stripeBillingPlan,
			},
		});
	}
};
