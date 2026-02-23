import type {
	BillingPlan,
	BillingResult,
	MultiAttachBillingContext,
	MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { computeMultiAttachPlan } from "./compute/computeMultiAttachPlan";
import { handleMultiAttachCurrentProductErrors } from "./errors/handleMultiAttachCurrentProductErrors";
import { handleMultiAttachPrepaidErrors } from "./errors/handleMultiAttachPrepaidErrors";
import { setupMultiAttachBillingContext } from "./setup/setupMultiAttachBillingContext";

export interface MultiAttachResult {
	billingContext: MultiAttachBillingContext;
	billingPlan?: BillingPlan;
	billingResult?: BillingResult;
}

export async function multiAttach({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: MultiAttachParamsV0;
	preview?: boolean;
}): Promise<MultiAttachResult> {
	// 1. Setup
	const billingContext = await setupMultiAttachBillingContext({
		ctx,
		params,
	});

	// 2. Errors
	handleMultiAttachCurrentProductErrors({
		productContexts: billingContext.productContexts,
		fullCustomer: billingContext.fullCustomer,
	});

	handleMultiAttachPrepaidErrors({
		productContexts: billingContext.productContexts,
	});

	// 3. Compute
	const autumnBillingPlan = computeMultiAttachPlan({
		ctx,
		multiAttachBillingContext: billingContext,
	});

	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

	// 4. Evaluate Stripe billing plan
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
