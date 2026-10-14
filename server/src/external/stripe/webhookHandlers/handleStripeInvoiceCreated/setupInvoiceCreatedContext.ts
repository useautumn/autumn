import {
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	secondsToMs,
	timestampsMatch,
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
import {
	stripeSubscriptionToNowMs,
	stripeSubscriptionToScheduleId,
} from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import type { InvoiceUpsertResult } from "@/internal/invoices/actions/types/invoiceUpsertResult";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

export interface InvoiceCreatedContext {
	stripeInvoice: ExpandedStripeInvoice<
		["discounts.source.coupon", "total_discount_amounts"]
	>;
	stripeSubscription: ExpandedStripeSubscription;
	stripeCustomer: ExpandedStripeCustomer;
	stripeSubscriptionId: string;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	billingCycleAnchorResetCustomerProductIds: string[];
	results: {
		customerStateChanged: boolean;
		invoice?: InvoiceUpsertResult;
	};

	nowMs: number;
	paymentMethod: Stripe.PaymentMethod | null;
}

export const setupInvoiceCreatedContext = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceCreatedEvent;
}): Promise<InvoiceCreatedContext | null> => {
	const { stripeCli, logger } = ctx;
	const fullCustomer = ctx.fullCustomer;

	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: event.data.object.id!,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	const stripeSubscriptionId =
		stripeInvoiceToStripeSubscriptionId(stripeInvoice);

	if (!stripeSubscriptionId) {
		logger.info("[invoice.created] No subscription ID, skipping");
		return null;
	}

	if (!fullCustomer) {
		logger.info("[invoice.created] fullCustomer not found, skipping");
		return null;
	}

	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: stripeSubscriptionId,
	});

	const currentCustomerProducts = fullCustomer.customer_products.filter(
		(cp) => {
			const onStripeSubscription = isCustomerProductOnStripeSubscription({
				customerProduct: cp,
				stripeSubscriptionId,
			});

			return onStripeSubscription;
		},
	);

	const customerProducts =
		await customerProductActions.expiredCache.getAndMerge({
			ctx,
			customerProducts: currentCustomerProducts,
			stripeSubscriptionId,
		});

	const scheduledCustomerProducts = fullCustomer.customer_products.filter(
		(cp) => {
			const scheduleId = stripeSubscriptionToScheduleId({ stripeSubscription });
			return isCustomerProductOnStripeSubscriptionSchedule({
				customerProduct: cp,
				stripeSubscriptionScheduleId: scheduleId ?? undefined,
			});
		},
	);

	if (customerProducts.length === 0) {
		logger.info(
			`[invoice.created] No customer products found for subscription ${stripeSubscriptionId}`,
		);
		return null;
	}

	fullCustomer.customer_products = [
		...customerProducts,
		...scheduledCustomerProducts,
	];

	const stripeCustomer = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId: stripeSubscription.customer.id,
	});

	if (!stripeCustomer) {
		logger.info("[invoice.created] stripeCustomer not found, skipping");
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

	const stripeAnchorMs = secondsToMs(stripeSubscription.billing_cycle_anchor);
	const billingCycleAnchorResetCustomerProductIds = customerProducts
		.filter(
			(customerProduct) =>
				typeof customerProduct.billing_cycle_anchor_resets_at === "number" &&
				timestampsMatch(
					customerProduct.billing_cycle_anchor_resets_at,
					stripeAnchorMs,
				),
		)
		.map((customerProduct) => customerProduct.id);

	return {
		stripeInvoice,
		stripeSubscription,
		stripeCustomer,
		stripeSubscriptionId,
		fullCustomer,
		customerProducts,
		billingCycleAnchorResetCustomerProductIds,
		results: { customerStateChanged: false },
		nowMs,
		paymentMethod,
	};
};
