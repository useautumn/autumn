import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
import type { BillingResult } from "@/internal/billing/v2/types/billingResult";

export const executeBillingPlan = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): Promise<BillingResult> => {
	const stripeBillingResult = await executeStripeBillingPlan({
		ctx,
		billingPlan,
		billingContext,
	});

	// console.log("stripeBillingResult", stripeBillingResult);

	if (stripeBillingResult.deferred)
		return {
			stripe: stripeBillingResult,
		};

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	return { stripe: stripeBillingResult };
};
