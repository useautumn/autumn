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

	const result = await executeStripeBillingPlan({
		ctx,
		billingPlan,
		billingContext,
	});

	if (result.deferred) return result;

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	return { billingPlan };
};
