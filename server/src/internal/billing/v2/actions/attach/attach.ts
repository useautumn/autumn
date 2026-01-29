import type {
	AttachBillingContext,
	AttachParamsV0,
	BillingPlan,
	BillingResult,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachPlan } from "@/internal/billing/v2/actions/attach/compute/computeAttachPlan";
import { createAutumnCheckout } from "@/internal/billing/v2/actions/attach/createAutumnCheckout";
import { handleAttachV2Errors } from "@/internal/billing/v2/actions/attach/errors/handleAttachV2Errors";
import { logAttachContext } from "@/internal/billing/v2/actions/attach/logs/logAttachContext";
import { setupAttachBillingContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachBillingContext";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";

export interface AttachResult {
	billingContext: AttachBillingContext;
	billingPlan?: BillingPlan;
	billingResult?: BillingResult | null;
	checkoutUrl?: string;
}

export async function attach({
	ctx,
	params,
	preview = false,
	skipAutumnCheckout = false,
}: {
	ctx: AutumnContext;
	params: AttachParamsV0;
	preview?: boolean;
	skipAutumnCheckout?: boolean;
}): Promise<AttachResult> {
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

	// 4. Evaluate Stripe billing plan (handles checkout mode internally)
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});

	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	const billingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};

	if (preview) {
		return {
			billingContext,
			billingPlan,
			billingResult: null,
		};
	}

	if (
		billingContext.checkoutMode === "autumn_checkout" &&
		!skipAutumnCheckout
	) {
		const checkoutResult = await createAutumnCheckout({
			ctx,
			params,
			billingContext,
			billingPlan,
		});

		return checkoutResult;
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
		checkoutUrl: billingResult.stripe.stripeCheckoutSession?.url ?? undefined,
	};
}
