import {
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency.js";
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
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";

export interface StripeSubscriptionDeletedContext {
	stripeSubscription: ExpandedStripeSubscription;
	stripeCustomer: ExpandedStripeCustomer;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	nowMs: number;
	paymentMethod: Stripe.PaymentMethod | null;
	updatedCustomerProducts: {
		customerProduct: FullCusProduct;
		updates: Partial<InsertCustomerProduct>;
	}[];
	deletedCustomerProducts: FullCusProduct[];
	insertedCustomerProducts: FullCusProduct[];
	billingChangeTags: Set<string>;
}

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

	if (isAutumnOriginatedStripeEvent({ event })) {
		logger.info(
			`[sub.deleted] Skipping - autumn-originated deletion ${stripeSubscriptionId}`,
		);
		return null;
	}

	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: stripeSubscriptionId,
	});

	const stripeCustomer = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId: stripeSubscription.customer.id,
	});

	if (!stripeCustomer) {
		logger.warn("[sub.deleted] stripeCustomer not found, skipping");
		return null;
	}

	const nowMs = await stripeSubscriptionToNowMs({
		stripeSubscription,
		stripeCli: ctx.stripeCli,
	});

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
		insertedCustomerProducts: [],
		billingChangeTags: new Set<string>(),
	};
};
