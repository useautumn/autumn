import type {
	ApprovalAction,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import type {
	BillingCancelFacts,
	BillingChangeFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToActionFacts } from "@/internal/approvals/facts/billing/billingPlanToActionFacts";
import type { BillingPreviewTotals } from "@/internal/approvals/facts/billing/billingPreviewTotals";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { type ApprovalResult, evaluateApproval } from "./evaluateApproval";

export type BillingApprovalResult = ApprovalResult<
	BillingChangeFacts | BillingCancelFacts
>;

/** Checks a billing request against the org's approval rules, on facts read through its preview. */
export const evaluateBillingApproval = ({
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
	/** The preview already built for this plan; built from the plan when absent. */
	preview?: BillingPreviewTotals;
	nextCycleStripeSubscriptionId?: string;
}): Promise<BillingApprovalResult | null> =>
	evaluateApproval({
		ctx,
		action,
		buildFacts: async () => {
			// A write has no preview enrichment yet; facts need its tax and credits to equal the preview.
			const previewBillingPlan =
				billingPlan.preview ??
				(await computeAttachPreviewBillingPlan({
					ctx,
					billingContext,
					autumnBillingPlan: billingPlan.autumn,
				}));
			return billingPlanToActionFacts({
				ctx,
				billingContext,
				billingPlan: { ...billingPlan, preview: previewBillingPlan },
				action,
				preview,
				nextCycleStripeSubscriptionId,
			});
		},
	});
