import { type AttachParamsV0, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachPlan } from "@/internal/billing/v2/actions/attach/compute/computeAttachPlan";
import { handleAttachV2Errors } from "@/internal/billing/v2/actions/attach/errors/handleAttachV2Errors";
import { logAttachContext } from "@/internal/billing/v2/actions/attach/logs/logAttachContext";
import { setupAttachBillingContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachBillingContext";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import type {
	AttachBillingContext,
	BillingPlan,
	BillingResult,
} from "@/internal/billing/v2/types";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";

export async function attach({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: AttachParamsV0;
	preview?: boolean;
}): Promise<{
	billingContext: AttachBillingContext;
	billingPlan: BillingPlan;
	billingResult: BillingResult | null;
}> {
	// 1. Setup
	const billingContext = await setupAttachBillingContext({
		ctx,
		params,
	});

	logAttachContext({ ctx, billingContext });

	// 2. Compute
	const autumnBillingPlan = computeAttachPlan({
		ctx,
		attachBillingContext: billingContext,
	});

	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

	// 3. Errors
	handleAttachV2Errors({
		ctx,
		billingContext,
		autumnBillingPlan,
		params,
	});

	if (billingContext.checkoutMode !== null) {
		// 4. Handle checkout mode (redirect to Stripe checkout)
		throw new RecaseError({
			message: `Checkout flow not yet implemented for attach v2 (checkoutMode: ${billingContext.checkoutMode}). Please add a payment method to the customer first.`,
			statusCode: 400,
		});
	}

	// 5. Evaluate Stripe billing plan
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

	if (!preview) {
		return {
			billingContext,
			billingPlan,
			billingResult: null,
		};
	}

	// 6. Execute billing plan
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
