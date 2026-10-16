import type {
	ApprovalAction,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateBillingApproval } from "@/internal/approvals/evaluate/evaluateBillingApproval";
import type { BillingPreviewTotals } from "@/internal/approvals/facts/billing/billingPreviewTotals";
import { previewPermissionTestFields } from "@/internal/approvals/facts/billing/testSurface/previewPermissionTestFields";

/**
 * Fields a billing preview adds for approvals: `permission`, the stored rules'
 * verdict, and the test-only `_permission_facts` / `_permission` behind their header.
 */
export const billingPreviewPermissionFields = async ({
	ctx,
	billingContext,
	billingPlan,
	preview,
	action,
	nextCycleStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	preview: BillingPreviewTotals;
	action: ApprovalAction;
	/** As the preview passes it: set plans scopes next_cycle to its subscription. */
	nextCycleStripeSubscriptionId?: string;
}) => {
	const input = {
		ctx,
		billingContext,
		billingPlan,
		preview,
		action,
		nextCycleStripeSubscriptionId,
	};
	const [approval, testFields] = await Promise.all([
		evaluateBillingApproval(input),
		previewPermissionTestFields(input),
	]);

	// No rule naming the member at any level reads like an org without rules: no field.
	const verdict = approval?.verdict;
	const permission =
		verdict && verdict.verdict !== "fallback" ? verdict : undefined;

	return { ...(permission && { permission }), ...testFields };
};
