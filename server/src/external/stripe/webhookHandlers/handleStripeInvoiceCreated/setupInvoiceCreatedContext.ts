import {
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	type ExpandedStripeCustomer,
	getExpandedStripeCustomer,
} from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import {
	type ExpandedStripeInvoice,
	getStripeInvoice,
} from "@/external/stripe/invoices/operations/getStripeInvoice";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils";
import {
	type ExpandedStripeSubscription,
	getExpandedStripeSubscription,
} from "@/external/stripe/subscriptions";
import { stripeSubscriptionToNowMs } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";

export interface InvoiceCreatedContext {
	stripeInvoice: ExpandedStripeInvoice<["discounts.source.coupon"]>;
	stripeSubscription: ExpandedStripeSubscription;
	stripeCustomer: ExpandedStripeCustomer;
	stripeSubscriptionId: string;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];

	/** Current time in ms, respecting test clocks */
	nowMs: number;
	/** Customer's payment method for paying arrear invoices */
	paymentMethod: Stripe.PaymentMethod | null;
}

export const setupInvoiceCreatedContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceCreatedEvent;
}): Promise<InvoiceCreatedContext | null> => {
	const { stripeCli, fullCustomer, logger } = ctx;

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
		logger.info("[invoice.created] No subscription ID, skipping");
		return null;
	}

	// 4. Check fullCustomer exists
	if (!fullCustomer) {
		logger.info("[invoice.created] fullCustomer not found, skipping");
		return null;
	}

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
		logger.info(
			`[invoice.created] No customer products found for subscription ${stripeSubscriptionId}`,
		);
		return null;
	}

	// 6. Update fullCustomer.customer_products with fresh data
	fullCustomer.customer_products = customerProducts;

	// 3. Get expanded stripe subscription
	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: stripeSubscriptionId,
	});

	// 4. Get expanded stripe customer (for discount info)
	const stripeCustomer = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId: stripeSubscription.customer.id,
	});

	if (!stripeCustomer) {
		logger.info("[invoice.created] stripeCustomer not found, skipping");
		return null;
	}

	// 5. Get current time (respecting test clocks)
	const nowMs = await stripeSubscriptionToNowMs({
		stripeSubscription,
		stripeCli: ctx.stripeCli,
	});

	// 6. Get payment method for arrear invoices
	const paymentMethod = await getCusPaymentMethod({
		stripeCli: ctx.stripeCli,
		stripeId: stripeSubscription.customer.id,
	});

	return {
		stripeInvoice,
		stripeSubscription,
		stripeCustomer,
		stripeSubscriptionId,
		fullCustomer,
		customerProducts,
		nowMs,
		paymentMethod,
	};
};
