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
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { processVercelInvoice } from "./tasks/processVercelInvoice";

export interface InvoiceFinalizedContext {
	stripeInvoice: ExpandedStripeInvoice<
		["discounts.source.coupon", "total_discount_amounts"]
	>;
	stripeSubscription: Stripe.Subscription | null;
	stripeSubscriptionId: string | null;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	isVercelInvoice: boolean;
}

const isVercelInvoice = ({
	stripeInvoice,
	stripeSubscription,
}: {
	stripeInvoice: Stripe.Invoice;
	stripeSubscription: Stripe.Subscription | null;
}): boolean => {
	const invoiceMeta = stripeInvoice.metadata as Record<string, string> | null;
	return Boolean(
		stripeSubscription?.metadata?.vercel_installation_id ||
			invoiceMeta?.vercel_installation_id,
	);
};

export const setupInvoiceFinalizedContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceFinalizedEvent;
}): Promise<InvoiceFinalizedContext | null> => {
	const { stripeCli, fullCustomer, logger } = ctx;

	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: event.data.object.id!,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	if (!fullCustomer) {
		logger.debug("[invoice.finalized] fullCustomer not found, skipping");
		return null;
	}

	// 2. Get subscription ID. Vercel manual invoices can be subscriptionless.
	const stripeSubscriptionId =
		stripeInvoiceToStripeSubscriptionId(stripeInvoice);

	let stripeSubscription: Stripe.Subscription | null = null;
	if (stripeSubscriptionId) {
		stripeSubscription = await getExpandedStripeSubscription({
			ctx,
			subscriptionId: stripeSubscriptionId,
		});
	}

	const vercelInvoice = isVercelInvoice({ stripeInvoice, stripeSubscription });
	if (vercelInvoice) {
		await processVercelInvoice({ ctx, stripeInvoice, stripeSubscription });
	}

	if (!stripeSubscriptionId || !stripeSubscription) {
		return {
			stripeInvoice,
			stripeSubscription: null,
			stripeSubscriptionId: null,
			fullCustomer,
			customerProducts: [],
			isVercelInvoice: vercelInvoice,
		};
	}

	const currentCustomerProducts = fullCustomer.customer_products.filter((cp) =>
		isCustomerProductOnStripeSubscription({
			customerProduct: cp,
			stripeSubscriptionId,
		}),
	);

	const customerProducts =
		await customerProductActions.expiredCache.getAndMerge({
			ctx,
			customerProducts: currentCustomerProducts,
			stripeSubscriptionId,
		});

	if (customerProducts.length === 0) {
		logger.debug(
			`[invoice.finalized] No customer products found for subscription ${stripeSubscriptionId}`,
		);
		return null;
	}

	fullCustomer.customer_products = customerProducts;

	return {
		stripeInvoice,
		stripeSubscription,
		stripeSubscriptionId,
		fullCustomer,
		customerProducts,
		isVercelInvoice: vercelInvoice,
	};
};
