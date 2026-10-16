import {
	type MultiUpdatePreviewResponseV0,
	type MultiUpdateSubscriptionPreviewV0,
	orgToCurrency,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { itemsToApprovalChecks } from "@/internal/approvals/enforce/itemsToApprovalChecks";
import { evaluateBillingApproval } from "@/internal/approvals/evaluate/evaluateBillingApproval";
import { combinedPreviewPermission } from "@/internal/approvals/preview/combinedPreviewPermission";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import type { MultiUpdateItemResult } from "../compute/computeMultiUpdateFold";
import type { MultiUpdateStripeBillingPlan } from "../evaluate/evaluateMultiUpdateStripe";

/**
 * Composes one CORE billing preview per subscription group — each built by the
 * same builders single-update previews use, from that group's sub-scoped plan
 * and context (own anchor, own tax inheritance) — and sums the totals.
 */
export const buildMultiUpdatePreviewResponse = async ({
	ctx,
	customerId,
	stripeBillingPlans,
	itemResults,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeBillingPlans: MultiUpdateStripeBillingPlan[];
	itemResults: MultiUpdateItemResult[];
}): Promise<MultiUpdatePreviewResponseV0> => {
	const subscriptions: MultiUpdateSubscriptionPreviewV0[] = [];

	for (const subscriptionPlan of stripeBillingPlans) {
		const preview = await computeAttachPreviewBillingPlan({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			autumnBillingPlan: subscriptionPlan.autumnBillingPlan,
		});

		const basePreview = await billingPlanToPreviewResponse({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			billingPlan: {
				autumn: subscriptionPlan.autumnBillingPlan,
				stripe: subscriptionPlan.stripeBillingPlan,
				preview,
			},
			nextCycleStripeSubscriptionId: subscriptionPlan.subscriptionId,
		});

		subscriptions.push({
			...basePreview,
			plan_ids: subscriptionPlan.planIds,
		});
	}

	const total = subscriptions
		.reduce((sum, subscription) => sum.add(subscription.total), new Decimal(0))
		.toDP(2)
		.toNumber();

	// Each item is judged on its own change, as the write will be.
	const approvals = await Promise.all(
		itemsToApprovalChecks({ itemResults }).map((check) =>
			evaluateBillingApproval({ ctx, ...check }),
		),
	);
	const permission = combinedPreviewPermission({
		verdicts: approvals.map((approval) => approval?.verdict),
	});

	return {
		...(permission && { permission }),
		object: "multi_update_preview",
		customer_id: customerId,
		currency: orgToCurrency({ org: ctx.org }),
		total,
		subscriptions,
	};
};
