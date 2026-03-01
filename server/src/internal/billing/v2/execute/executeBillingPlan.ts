import type {
	BillingContext,
	BillingPlan,
	BillingResult,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";

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

	if (stripeBillingResult.deferred)
		return {
			stripe: stripeBillingResult,
		};

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		stripeInvoice: stripeBillingResult.stripeInvoice,
		autumnInvoice: stripeBillingResult.autumnInvoice,
	});

	// Queue webhooks after Autumn billing plan is executed
	await billingPlanToSendProductsUpdated({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		billingContext,
	});

	return { stripe: stripeBillingResult };
};
