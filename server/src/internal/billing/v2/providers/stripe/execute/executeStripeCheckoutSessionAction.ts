import {
	type BillingContext,
	type BillingPlan,
	billingContextToCurrency,
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

export const LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY =
	"autumn_long_lived_checkout";

export const createStripeCheckoutSessionFromAction = async ({
	ctx,
	billingContext,
	checkoutSessionAction,
	metadataId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	checkoutSessionAction: StripeCheckoutSessionAction;
	metadataId: string;
}) => {
	const { org } = ctx;
	const { params } = checkoutSessionAction;
	const { longLivedCheckout } = billingContext;

	// Tax-related fields (automatic_tax, billing_address_collection, customer_update,
	// tax_id_collection) are already baked into action.params by buildStripeCheckoutSessionAction.
	const fullParams = buildCheckoutSessionParams({
		params: longLivedCheckout
			? {
					...params,
					metadata: {
						...params.metadata,
						[LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY]: longLivedCheckout.id,
					},
				}
			: params,
		checkoutSessionParams: checkoutSessionAction.checkoutSessionParams,
		currency: billingContextToCurrency({ org, billingContext }),
		defaultAllowPromotionCodes: true,
		defaultSavedPaymentMethodOptions: { payment_method_save: "enabled" },
		defaultInvoiceCreation:
			params.mode === "payment" ? { enabled: true } : undefined,
		autumnMetadataId: metadataId,
		userMetadata: billingContext.userMetadata,
	});

	return createStripeSessionWithCardFallback({
		stripeCli: createStripeCli({ org, env: billingContext.fullCustomer.env }),
		params: fullParams,
	});
};

const getCheckoutMetadataType = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => {
	if (billingContext.longLivedCheckout) {
		return MetadataType.LongLivedCheckoutEnabledImmediately;
	}
	if (billingContext.enablePlanImmediately === true) {
		return MetadataType.CheckoutSessionEnabledImmediately;
	}
	return MetadataType.CheckoutSessionV2;
};

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
	const { logger } = ctx;
	const { fullCustomer } = billingContext;

	const enablePlanImmediately = billingContext.enablePlanImmediately === true;
	const metadataType = getCheckoutMetadataType({ billingContext });

	// 1. Insert metadata FIRST (without checkout session ID)
	const metadata = await insertMetadataFromBillingPlan({
		ctx,
		billingPlan,
		billingContext,
		resumeAfter: undefined,
		expiresAt:
			billingContext.longLivedCheckout?.expiresAt ??
			addDays(Date.now(), 10).getTime(),
		typeOverride: metadataType,
	});

	// 2. Create checkout session with card-type fallback
	const stripeCheckoutSession = await createStripeCheckoutSessionFromAction({
		ctx,
		billingContext,
		checkoutSessionAction,
		metadataId: metadata.id,
	});

	logger.info(
		`Created checkout session for customer ${fullCustomer.id ?? fullCustomer.internal_id}`,
	);

	// 3. Update metadata with checkout session ID
	await updateMetadataWithCheckoutSession({
		ctx,
		metadataId: metadata.id,
		stripeCheckoutSessionId: stripeCheckoutSession.id,
		type: metadataType,
	});

	// 4. When enable_plan_immediately is set, link each cusProduct row that's
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

	// 5. Default: defer Autumn billing plan execution to the webhook handler.
	return {
		deferred: true,
		deferredMetadataId: metadata.id,
		stripeCheckoutSession,
	};
};
