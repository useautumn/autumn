import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { logBillingPlan } from "@/internal/billing/v2/utils/logBillingPlan";

export const executeBillingPlan = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	logBillingPlan({ ctx, billingPlan });

	const enableProductImmediately =
		billingPlan.stripe.invoiceAction?.invoiceMode?.enableProductImmediately !==
		false;

	await executeStripeBillingPlan({
		ctx,
		stripeBillingPlan: billingPlan.stripe,
		autumnBillingPlan: billingPlan.autumn,
		billingContext,
	});

	// if not enabling product immediately, it will be handled in webhook
	if (enableProductImmediately) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: billingPlan.autumn,
		});
	}

	return { billingPlan };
};
