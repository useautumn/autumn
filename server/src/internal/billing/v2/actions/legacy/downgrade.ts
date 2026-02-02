import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachPlan } from "@/internal/billing/v2/actions/attach/compute/computeAttachPlan";
import { attachParamsToAttachBillingContext } from "@/internal/billing/v2/actions/legacy/setup/attachParamsToLegacyBillingContext";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const downgrade = async ({
	ctx,
	attachParams,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
}) => {
	// 1. Get billing context
	const billingContext = await attachParamsToAttachBillingContext({
		ctx,
		attachParams,
		planTiming: "end_of_cycle",
	});

	// 2. Compute upgrade plan
	const autumnBillingPlan = computeAttachPlan({
		ctx,
		attachBillingContext: billingContext,
	});

	// Params:

	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

	// 4. Evaluate Stripe billing plan (handles checkout mode internally)
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
	});

	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	const billingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};

	// 6. Execute billing plan
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
	});

	return {
		billingContext,
		billingPlan,
		billingResult,
	};
};
