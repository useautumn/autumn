import {
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	type ExpandedStripeCustomer,
	getExpandedStripeCustomer,
} from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils";
import {
	type ExpandedStripeSubscription,
	getExpandedStripeSubscription,
} from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { stripeSubscriptionToNowMs } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";

export interface StripeSubscriptionDeletedContext {
	stripeSubscription: ExpandedStripeSubscription;
	stripeCustomer: ExpandedStripeCustomer;
	fullCustomer: FullCustomer;
	/** Customer products that are on this subscription */
	customerProducts: FullCusProduct[];
	/** Current time in ms, respecting test clocks */
	nowMs: number;
	/** Customer's payment method for paying arrear invoices */
	paymentMethod: Stripe.PaymentMethod | null;
	/** Tracks all updates made to customer products during this handler */
	updatedCustomerProducts: {
		customerProduct: FullCusProduct;
		updates: Partial<InsertCustomerProduct>;
	}[];
	/** Tracks all deletions made to customer products during this handler */
	deletedCustomerProducts: FullCusProduct[];
}

/**
 * Sets up context for the subscription deleted handler.
 *
 * Returns null if:
 * - No fullCustomer in context
 * - No customer products found for this subscription
 * - Lock exists on the subscription (Autumn initiated the deletion)
 */
export const setupStripeSubscriptionDeletedContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CustomerSubscriptionDeletedEvent;
}): Promise<StripeSubscriptionDeletedContext | null> => {
	const { fullCustomer, logger } = ctx;

	if (!fullCustomer) {
		logger.warn("[sub.deleted] fullCustomer not found, skipping");
		return null;
	}

	const stripeSubscriptionId = event.data.object.id;

	// 1. Filter customer products on this subscription
	const customerProducts = fullCustomer.customer_products.filter((cp) =>
		isCustomerProductOnStripeSubscription({
			customerProduct: cp,
			stripeSubscriptionId,
		}),
	);

	if (customerProducts.length === 0) {
		logger.info(
			`[sub.deleted] No customer products found for subscription ${stripeSubscriptionId}`,
		);
		return null;
	}

	// 2. Check lock - if Autumn initiated this deletion, skip
	const lock = await getStripeSubscriptionLock({
		stripeSubscriptionId,
	});

	if (lock) {
		logger.info(
			`[sub.deleted] Skipping - lock found on subscription ${stripeSubscriptionId}`,
		);
		return null;
	}

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
		logger.warn("[sub.deleted] stripeCustomer not found, skipping");
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
		stripeSubscription,
		stripeCustomer,
		fullCustomer,
		customerProducts,
		nowMs,
		paymentMethod,
		updatedCustomerProducts: [],
		deletedCustomerProducts: [],
	};
};
