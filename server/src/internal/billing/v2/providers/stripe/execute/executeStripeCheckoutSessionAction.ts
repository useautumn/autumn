import {
	type BillingContext,
	type BillingPlan,
	MetadataType,
	type StripeBillingPlanResult,
	type StripeCheckoutSessionAction,
} from "@autumn/shared";
import { addDays } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addStripeCheckoutSessionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeCheckoutSessionIdToBillingPlan";
import { buildCheckoutSessionParams } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/buildCheckoutSessionParams";
import { createStripeSessionWithCardFallback } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/createStripeSessionWithCardFallback";
import {
	insertMetadataFromBillingPlan,
	updateMetadataWithCheckoutSession,
} from "@/internal/metadata/utils/insertMetadataFromBillingPlan";
import { orgToCurrency } from "@/internal/orgs/orgUtils";

export const executeStripeCheckoutSessionAction = async ({
	ctx,
	billingPlan,
	billingContext,
	checkoutSessionAction,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	checkoutSessionAction: StripeCheckoutSessionAction;
}): Promise<StripeBillingPlanResult> => {
	const { org, logger } = ctx;
	const { fullCustomer } = billingContext;

	const stripeCli = createStripeCli({ org, env: fullCustomer.env });

	const enablePlanImmediately = billingContext.enablePlanImmediately === true;
	const metadataType = enablePlanImmediately
		? MetadataType.CheckoutSessionEnabledImmediately
		: MetadataType.CheckoutSessionV2;

	// 1. Insert metadata FIRST (without checkout session ID)
	const metadata = await insertMetadataFromBillingPlan({
		ctx,
		billingPlan,
		billingContext,
		resumeAfter: undefined,
		expiresAt: addDays(Date.now(), 10).getTime(),
		typeOverride: metadataType,
	});

	// 2. Build full checkout params (merge variable + static params)
	const fullParams = buildCheckoutSessionParams({
		params: checkoutSessionAction.params,
		checkoutSessionParams: checkoutSessionAction.checkoutSessionParams,
		currency: orgToCurrency({ org }),
		defaultAllowPromotionCodes: true,
		defaultSavedPaymentMethodOptions: { payment_method_save: "enabled" },
		defaultInvoiceCreation:
			checkoutSessionAction.params.mode === "payment"
				? { enabled: true }
				: undefined,
		autumnMetadataId: metadata.id,
		userMetadata: billingContext.userMetadata,
	});

	// 3. Create checkout session with card-type fallback
	const stripeCheckoutSession = await createStripeSessionWithCardFallback({
		stripeCli,
		params: fullParams,
	});

	logger.info(
		`Created checkout session for customer ${fullCustomer.id ?? fullCustomer.internal_id}`,
	);

	// 4. Update metadata with checkout session ID
	await updateMetadataWithCheckoutSession({
		ctx,
		metadataId: metadata.id,
		stripeCheckoutSessionId: stripeCheckoutSession.id,
		type: metadataType,
	});

	// 5. When enable_plan_immediately is set, link each cusProduct row that's
	// about to be inserted to this checkout session, and let the Autumn billing
	// plan continue executing (deferred=false). The webhook will patch in
	// subscription_ids on completion.
	if (enablePlanImmediately) {
		addStripeCheckoutSessionIdToBillingPlan({
			autumnBillingPlan: billingPlan.autumn,
			stripeCheckoutSessionId: stripeCheckoutSession.id,
		});

		return {
			deferred: false,
			stripeCheckoutSession,
		};
	}

	// 6. Default: defer Autumn billing plan execution to the webhook handler.
	return {
		deferred: true,
		stripeCheckoutSession,
	};
};
