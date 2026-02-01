import type { Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import {
	type ExpandedStripeCheckoutSession,
	getStripeCheckoutSession,
} from "@/external/stripe/checkoutSessions/operations/getStripeCheckoutSession";
import { stripeCheckoutSessionUtils } from "@/external/stripe/checkoutSessions/utils";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import {
	type ExpandedStripeSubscription,
	getExpandedStripeSubscription,
} from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

type CheckoutSessionExpansions = ["line_items"];

export interface CheckoutSessionCompletedContext {
	stripeCheckoutSession: ExpandedStripeCheckoutSession<CheckoutSessionExpansions>;
	stripeSubscription?: ExpandedStripeSubscription;
	stripeInvoice?: Stripe.Invoice;
	metadata?: Metadata;
}

export const setupCheckoutSessionCompletedContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CheckoutSessionCompletedEvent;
}): Promise<CheckoutSessionCompletedContext> => {
	const { db, stripeCli } = ctx;

	// Fetch checkout session fresh from Stripe with line_items expanded
	const stripeCheckoutSession = await getStripeCheckoutSession({
		ctx,
		checkoutSessionId: event.data.object.id,
		expand: ["line_items"],
	});

	// Get metadata from checkout session
	const metadata = await getMetadataFromCheckoutSession(
		stripeCheckoutSession,
		db,
	);

	// Extract subscription and invoice IDs
	const subscriptionId =
		await stripeCheckoutSessionUtils.convert.toSubscriptionId({
			stripeCheckoutSession,
		});
	const invoiceId = await stripeCheckoutSessionUtils.convert.toInvoiceId({
		stripeCheckoutSession,
	});

	// Fetch expanded subscription and invoice in parallel
	const [stripeSubscription, stripeInvoice] = await Promise.all([
		subscriptionId
			? getExpandedStripeSubscription({ ctx, subscriptionId })
			: undefined,
		invoiceId
			? getStripeInvoice({ stripeClient: stripeCli, invoiceId, expand: [] })
			: undefined,
	]);

	return {
		stripeCheckoutSession,
		stripeSubscription,
		stripeInvoice,
		metadata: metadata ?? undefined,
	};
};
