import {
	type BillingResponse,
	type Checkout,
	CheckoutCompletedError,
	CheckoutStatus,
	type DeferredAutumnBillingPlanData,
	InternalError,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	createStripeCheckoutSessionFromAction,
	LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY,
} from "@/internal/billing/v2/providers/stripe/execute/executeStripeCheckoutSessionAction";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { updateMetadataWithCheckoutSession } from "@/internal/metadata/utils/insertMetadataFromBillingPlan";
import { updateCheckoutDbAndCache } from "./updateDbAndCache";

const STRIPE_SESSION_ID_REGEX = /cs_(test|live)_[A-Za-z0-9]+/;

/**
 * Opens a fresh Stripe session for a plan the link already granted, without re-running attach.
 * Returns null for links whose plan was not granted at creation.
 */
export const renewLongLivedCheckoutSession = async ({
	ctx,
	checkout,
}: {
	ctx: AutumnContext;
	checkout: Checkout;
}): Promise<BillingResponse | null> => {
	const previousSessionId = checkout.response?.payment_url?.match(
		STRIPE_SESSION_ID_REGEX,
	)?.[0];
	if (!checkout.response || !previousSessionId) return null;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const previousSession =
		await stripeCli.checkout.sessions.retrieve(previousSessionId);
	if (!previousSession.metadata?.[LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY]) {
		return null;
	}

	const metadataId = previousSession.metadata?.autumn_metadata_id;
	const pendingMetadata = metadataId
		? await MetadataService.get({ db: ctx.db, id: metadataId })
		: null;

	// Completion deletes the pending metadata, so its absence means the plan was paid.
	if (!metadataId || !pendingMetadata) {
		await updateCheckoutDbAndCache({
			ctx,
			oldCheckout: checkout,
			updates: { status: CheckoutStatus.Completed, completed_at: Date.now() },
		});
		throw new CheckoutCompletedError();
	}

	const { billingContext, billingPlan } =
		pendingMetadata.data as DeferredAutumnBillingPlanData;
	const checkoutSessionAction = billingPlan.stripe.checkoutSessionAction;
	if (!checkoutSessionAction) {
		throw new InternalError({
			message: `Metadata ${metadataId} has no checkout session action`,
		});
	}

	const stripeCheckoutSession = await createStripeCheckoutSessionFromAction({
		ctx,
		billingContext,
		checkoutSessionAction,
		metadataId,
	});

	await updateMetadataWithCheckoutSession({
		ctx,
		metadataId,
		stripeCheckoutSessionId: stripeCheckoutSession.id,
		type: pendingMetadata.type ?? undefined,
	});

	const grantedCustomerProducts =
		await CusProductService.getByStripeCheckoutSessionId({
			db: ctx.db,
			stripeCheckoutSessionId: previousSessionId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	for (const customerProduct of grantedCustomerProducts) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { stripe_checkout_session_id: stripeCheckoutSession.id },
		});
	}

	return { ...checkout.response, payment_url: stripeCheckoutSession.url };
};
