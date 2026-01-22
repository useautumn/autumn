import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
import type { BillingResult } from "@/internal/billing/v2/types/billingResult";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";

export const executeBillingPlan = async ({
	ctx,
	billingContext,
	billingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	params?: UpdateSubscriptionV0Params;
}): Promise<BillingResult> => {
	const stripeBillingResult = await executeStripeBillingPlan({
		ctx,
		billingPlan,
		billingContext,
		params,
	});

	if (stripeBillingResult.deferred)
		return {
			stripe: stripeBillingResult,
		};

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	// Queue webhooks after Autumn billing plan is executed
	await billingPlanToSendProductsUpdated({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		billingContext,
	});

	return { stripe: stripeBillingResult };
};
