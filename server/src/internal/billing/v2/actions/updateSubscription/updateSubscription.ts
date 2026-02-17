import type {
	BillingPlan,
	BillingResult,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionBillingContextOverride,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan";
import { handleUpdateSubscriptionErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleUpdateSubscriptionErrors";
import { logUpdateSubscriptionContext } from "@/internal/billing/v2/actions/updateSubscription/logs/logUpdateSubscriptionContext";
import { setupUpdateSubscriptionBillingContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionBillingContext";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";

export async function updateSubscription({
	ctx,
	params,
	preview = false,
	contextOverride,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	preview?: boolean;
	contextOverride?: UpdateSubscriptionBillingContextOverride;
}): Promise<{
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	billingResult: BillingResult | null;
}> {
	ctx.logger.info(
		`=============== RUNNING UPDATE SUBSCRIPTION FOR ${params.customer_id} ===============`,
	);

	// 1. Setup
	const billingContext = await setupUpdateSubscriptionBillingContext({
		ctx,
		params,
		contextOverride,
	});

	logUpdateSubscriptionContext({ ctx, billingContext });

	// 2. Compute
	const autumnBillingPlan = await computeUpdateSubscriptionPlan({
		ctx,
		billingContext,
		params,
	});
	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

	// 3. Evaluate Stripe billing plan
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

	// 4. Errors
	await handleUpdateSubscriptionErrors({
		ctx,
		billingContext,
		billingPlan,
		params,
	});

	if (preview) {
		return {
			billingContext,
			billingPlan,
			billingResult: null,
		};
	}

	// 5. Execute billing plan
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
	});

	logStripeBillingResult({ ctx, result: billingResult.stripe });

	return {
		billingContext,
		billingPlan,
		billingResult,
	};
}
