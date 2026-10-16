import {
	ACTIONS,
	type ApprovalAction,
	type BillingContext,
	type BillingPlan,
	InternalError,
} from "@autumn/shared";
import type {
	BillingCancelFacts,
	BillingChangeFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import type { BillingPreviewTotals } from "./billingPreviewTotals";
import { buildBillingCancelFacts } from "./buildBillingCancelFacts";
import { buildBillingChangeFacts } from "./buildBillingChangeFacts";
import { setupCurrentStripeDiscounts } from "./setupCurrentStripeDiscounts";

/**
 * The facts approval rules check for a billing action, read from the billing
 * plan through the preview so they always equal what the preview shows.
 */
export const billingPlanToActionFacts = async ({
	ctx,
	billingContext,
	billingPlan,
	action,
	preview,
	nextCycleStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	/** The preview already built for this plan; built here when absent. */
	preview?: BillingPreviewTotals;
	/** As the preview passes it: set plans scopes next_cycle to one Stripe subscription. */
	nextCycleStripeSubscriptionId?: string;
}): Promise<BillingChangeFacts | BillingCancelFacts> => {
	const { when } = ACTIONS[action];
	if (when !== "billing_change" && when !== "billing_cancel") {
		throw new InternalError({
			message: `Approval facts: ${action} is not a billing action`,
		});
	}

	const resolvedPreview =
		preview ??
		(await billingPlanToPreviewResponse({
			ctx,
			billingContext,
			billingPlan,
			nextCycleStripeSubscriptionId,
		}));

	if (when === "billing_cancel") {
		return buildBillingCancelFacts({
			billingContext,
			billingPlan,
			preview: resolvedPreview,
		});
	}

	return buildBillingChangeFacts({
		ctx,
		billingContext,
		billingPlan,
		preview: resolvedPreview,
		currentDiscounts: await setupCurrentStripeDiscounts({
			ctx,
			billingContext,
		}),
	});
};
