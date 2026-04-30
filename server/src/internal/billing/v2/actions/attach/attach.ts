import {
	type AttachBillingContext,
	type AttachParamsV1,
	type BillingContextOverride,
	CheckoutAction,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachPlan } from "@/internal/billing/v2/actions/attach/compute/computeAttachPlan";
import { handleAttachV2Errors } from "@/internal/billing/v2/actions/attach/errors/handleAttachV2Errors";
import { logAttachContext } from "@/internal/billing/v2/actions/attach/logs/logAttachContext";
import { setupAttachBillingContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachBillingContext";
import { checkCheckoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkCheckoutSessionLock";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { hashJson } from "@/utils/hash/hashJson";
import {
	type CreateAutumnCheckoutResult,
	createAutumnCheckout,
} from "../../common/createAutumnCheckout";

export async function attach({
	ctx,
	params,
	preview = false,
	skipAutumnCheckout = false,

	contextOverride,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	preview?: boolean;
	skipAutumnCheckout?: boolean;

	contextOverride?: BillingContextOverride;
}): Promise<CreateAutumnCheckoutResult<AttachBillingContext>> {
	// 1. Setup
	const billingContext = await setupAttachBillingContext({
		ctx,
		params,
		contextOverride,
	});

	logAttachContext({ ctx, billingContext });

	// 2. Compute
	const autumnBillingPlan = computeAttachPlan({
		ctx,
		attachBillingContext: billingContext,
		params,
	});

	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

	// 3. Evaluate Stripe billing plan (handles checkout mode internally)
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});

	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	// 3b. Build preview-only enrichments (read-only, never executed).
	const previewBillingPlan = preview
		? await computeAttachPreviewBillingPlan({
				ctx,
				billingContext,
				autumnBillingPlan,
			})
		: undefined;

	const billingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
		preview: previewBillingPlan,
	};

	// 4. Errors (requires full billing plan)
	await handleAttachV2Errors({
		ctx,
		billingContext,
		billingPlan,
		params,
	});

	if (preview) {
		return {
			billingContext,
			billingPlan,
		};
	}

	// 5. Checkout session lock (skip for confirm flows)
	if (!skipAutumnCheckout) {
		const cachedResult = await checkCheckoutSessionLock({
			ctx,
			params,
			billingContext,
			billingPlan,
		});

		if (cachedResult) return cachedResult;
	}

	if (
		billingContext.checkoutMode === "autumn_checkout" &&
		!skipAutumnCheckout
	) {
		return createAutumnCheckout<AttachBillingContext>({
			ctx,
			action: CheckoutAction.Attach,
			params,
			billingContext,
			billingPlan,
		});
	}

	// 6. Execute billing plan
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
		checkoutLockParamsHash: !skipAutumnCheckout
			? hashJson({ value: params })
			: undefined,
	});

	logStripeBillingResult({ ctx, result: billingResult.stripe });

	return {
		billingContext,
		billingPlan,
		billingResult,
	};
}
