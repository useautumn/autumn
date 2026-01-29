import { type Metadata, MetadataType } from "@autumn/shared";
import type Stripe from "stripe";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

export interface CheckoutSessionCompletedContext {
	stripeCheckoutSession: Stripe.Checkout.Session;
	stripeSubscription?: Stripe.Subscription;
	stripeInvoice?: Stripe.Invoice;
	metadata: Metadata;
}

export const setupCheckoutSessionCompletedContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CheckoutSessionCompletedEvent;
}): Promise<CheckoutSessionCompletedContext | null> => {
	const { db, stripeCli } = ctx;
	const checkoutSessionData = event.data.object;

	// Get metadata from checkout session
	const metadata = await getMetadataFromCheckoutSession(
		checkoutSessionData,
		db,
	);

	// Return null if no metadata or not V2 checkout session type
	if (!metadata || metadata.type !== MetadataType.CheckoutSessionV2) {
		return null;
	}

	// Expand checkout session to get subscription and invoice
	const stripeCheckoutSession = await stripeCli.checkout.sessions.retrieve(
		checkoutSessionData.id,
		{
			expand: ["subscription", "invoice"],
		},
	);

	const stripeSubscription = stripeCheckoutSession.subscription as
		| Stripe.Subscription
		| undefined;
	const stripeInvoice = stripeCheckoutSession.invoice as
		| Stripe.Invoice
		| undefined;

	return {
		stripeCheckoutSession,
		stripeSubscription: stripeSubscription ?? undefined,
		stripeInvoice: stripeInvoice ?? undefined,
		metadata,
	};
};
