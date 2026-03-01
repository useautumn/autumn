import {
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	type ExpandedStripeInvoice,
	getStripeInvoice,
} from "@/external/stripe/invoices/operations/getStripeInvoice";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { getExpandedStripeSubscription } from "@/external/stripe/subscriptions";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { FeatureService } from "@/internal/features/FeatureService";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";

export interface InvoiceFinalizedContext {
	stripeInvoice: ExpandedStripeInvoice<["discounts.source.coupon"]>;
	stripeSubscription: Stripe.Subscription;
	stripeSubscriptionId: string;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	features: Awaited<ReturnType<typeof FeatureService.list>>;
}

export const setupInvoiceFinalizedContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceFinalizedEvent;
}): Promise<InvoiceFinalizedContext | null> => {
	const { stripeCli, fullCustomer, db, org, env, logger } = ctx;

	// 1. Get expanded invoice
	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: event.data.object.id!,
		expand: ["discounts.source.coupon"],
	});

	// 2. Get subscription ID - return null if not a subscription invoice
	const stripeSubscriptionId =
		stripeInvoiceToStripeSubscriptionId(stripeInvoice);

	if (!stripeSubscriptionId) {
		logger.debug("[invoice.finalized] No subscription ID, skipping");
		return null;
	}

	// 3. Check fullCustomer exists
	if (!fullCustomer) {
		logger.debug("[invoice.finalized] fullCustomer not found, skipping");
		return null;
	}

	// 4. Get expanded stripe subscription
	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: stripeSubscriptionId,
	});

	// 5. Get customer products by subscription ID
	const currentCustomerProducts = fullCustomer.customer_products.filter((cp) =>
		isCustomerProductOnStripeSubscription({
			customerProduct: cp,
			stripeSubscriptionId,
		}),
	);

	const customerProducts =
		await customerProductActions.expiredCache.getAndMerge({
			customerProducts: currentCustomerProducts,
			stripeSubscriptionId,
		});

	if (customerProducts.length === 0) {
		logger.debug(
			`[invoice.finalized] No customer products found for subscription ${stripeSubscriptionId}`,
		);
		return null;
	}

	// 6. Update fullCustomer.customer_products with fresh data
	fullCustomer.customer_products = customerProducts;

	// 7. Get features for Vercel invoice processing
	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env,
	});

	return {
		stripeInvoice,
		stripeSubscription,
		stripeSubscriptionId,
		fullCustomer,
		customerProducts,
		features,
	};
};
