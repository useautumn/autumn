import type {
	BillingContext,
	BillingPlan,
	StripeBillingPlanResult,
	StripeCheckoutSessionAction,
} from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
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

	// 1. Insert metadata FIRST (without checkout session ID)
	const metadata = await insertMetadataFromBillingPlan({
		ctx,
		billingPlan,
		billingContext,
		resumeAfter: undefined,
		expiresAt: addDays(Date.now(), 10).getTime(),
	});

	// 2. Build full checkout params (merge variable + static params)
	// Stripe doesn't allow both `discounts` and `allow_promotion_codes` simultaneously
	const hasPreAppliedDiscounts =
		!!checkoutSessionAction.params.discounts?.length;

	const fullParams: Stripe.Checkout.SessionCreateParams = {
		...checkoutSessionAction.params,

		// Static params
		currency: orgToCurrency({ org }),
		allow_promotion_codes: hasPreAppliedDiscounts ? undefined : true,
		saved_payment_method_options: { payment_method_save: "enabled" },
		invoice_creation:
			checkoutSessionAction.params.mode === "payment"
				? { enabled: true }
				: undefined,

		// Link to metadata
		metadata: { autumn_metadata_id: metadata.id },
	};

	// 3. Create checkout session with fallback for payment method types
	let stripeCheckoutSession: Stripe.Checkout.Session;
	try {
		stripeCheckoutSession =
			await stripeCli.checkout.sessions.create(fullParams);
		logger.info(
			`✅ Created checkout session for customer ${fullCustomer.id ?? fullCustomer.internal_id}`,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : undefined;
		if (msg?.includes("No valid payment method types")) {
			stripeCheckoutSession = await stripeCli.checkout.sessions.create({
				...fullParams,
				payment_method_types: ["card"],
			});
			logger.info(
				"✅ Created fallback checkout session with card payment method",
			);
		} else {
			throw error;
		}
	}

	// 4. Update metadata with checkout session ID
	await updateMetadataWithCheckoutSession({
		ctx,
		metadataId: metadata.id,
		stripeCheckoutSessionId: stripeCheckoutSession.id,
	});

	// 5. Return result with checkout session
	return {
		deferred: true,
		stripeCheckoutSession,
	};
};
