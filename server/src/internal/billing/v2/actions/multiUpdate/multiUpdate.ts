import {
	type BillingPlan,
	type BillingResult,
	ErrCode,
	type MultiUpdateParamsV0,
	type MultiUpdatePreviewResponseV0,
	RecaseError,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeMultiSubscriptionBillingPlan } from "@/internal/billing/v2/execute/executeMultiSubscriptionBillingPlan";
import { voidInvoicesOnImmediateCancel } from "@/internal/billing/v2/execute/voidInvoicesOnImmediateCancel";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { computeMultiUpdateFold } from "./compute/computeMultiUpdateFold";
import { handleMultiUpdateErrors } from "./errors/handleMultiUpdateErrors";
import { evaluateMultiUpdateStripe } from "./evaluate/evaluateMultiUpdateStripe";
import { buildMultiUpdatePreviewResponse } from "./preview/buildMultiUpdatePreviewResponse";

export type MultiUpdateResult = {
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	billingResult?: BillingResult;
	previewResponse?: MultiUpdatePreviewResponseV0;
};

export async function multiUpdate({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: MultiUpdateParamsV0;
	preview?: boolean;
}): Promise<MultiUpdateResult> {
	ctx.logger.info(
		`=============== RUNNING MULTI UPDATE FOR ${params.customer_id} ===============`,
	);

	// 1. Setup: one customer load; per-item contexts are built inside the fold
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: params.customer_id },
	});

	// 2. Compute: fold every update onto one AutumnBillingPlan
	const { autumnBillingPlan, itemResults } = await computeMultiUpdateFold({
		ctx,
		params,
		fullCustomer,
		preview,
	});

	// 3. Evaluate once per distinct subscription, each against its own sub-scoped plan
	const stripeBillingPlans = await evaluateMultiUpdateStripe({
		ctx,
		fullCustomer,
		itemResults,
	});

	const primaryBillingContext =
		stripeBillingPlans[0]?.billingContext ?? itemResults[0].billingContext;

	logAutumnBillingPlan({
		ctx,
		plan: autumnBillingPlan,
		billingContext: primaryBillingContext,
	});
	for (const subscriptionPlan of stripeBillingPlans) {
		logStripeBillingPlan({
			ctx,
			stripeBillingPlan: subscriptionPlan.stripeBillingPlan,
			billingContext: subscriptionPlan.billingContext,
		});
	}

	// 4. Errors — per item, before any execution
	await handleMultiUpdateErrors({ ctx, itemResults, stripeBillingPlans });

	const billingPlan: BillingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlans[0]?.stripeBillingPlan ?? {},
	};

	if (preview) {
		const previewResponse = await buildMultiUpdatePreviewResponse({
			ctx,
			customerId: params.customer_id,
			stripeBillingPlans,
		});
		return {
			billingContext: primaryBillingContext,
			billingPlan,
			billingResult: undefined,
			previewResponse,
		};
	}

	// Cancels never require checkout; reject any path that would need payment
	if (primaryBillingContext.checkoutMode !== null) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			message: "Multi update does not support updates that require checkout",
		});
	}

	// 5. Execute: one Stripe execution per subscription, one Autumn execution
	const stripeResults = await executeMultiSubscriptionBillingPlan({
		ctx,
		autumnBillingPlan,
		stripeBillingPlans,
		primaryBillingContext,
		originalFullCustomer: fullCustomer,
	});

	for (const [index, subscriptionPlan] of stripeBillingPlans.entries()) {
		await voidInvoicesOnImmediateCancel({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			billingPlan: {
				autumn: subscriptionPlan.autumnBillingPlan,
				stripe: subscriptionPlan.stripeBillingPlan,
			},
			billingResult: { stripe: stripeResults[index] },
		});
	}

	return {
		billingContext: primaryBillingContext,
		billingPlan,
		billingResult: { stripe: stripeResults[0] ?? {} },
	};
}
