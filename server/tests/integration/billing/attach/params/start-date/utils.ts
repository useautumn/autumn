import { expect } from "bun:test";
import { type FullCusProduct, ms } from "@autumn/shared";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { handleSubCreated } from "@/external/stripe/webhookHandlers/handleSubCreated";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";

export const getCustomerProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: Parameters<typeof CusService.getFull>[0]["ctx"];
	customerId: string;
	productId: string;
}): Promise<FullCusProduct> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProduct = fullCustomer.customer_products.find(
		(cp) => cp.product_id === productId,
	);
	expect(cusProduct).toBeDefined();
	return cusProduct!;
};

export const expectResetAnchoredTo = ({
	cusProduct,
	featureId,
	startDate,
}: {
	cusProduct: FullCusProduct;
	featureId: string;
	startDate: number;
}) => {
	const entitlement = cusProduct.customer_entitlements.find(
		(ce) => ce.feature_id === featureId,
	);
	const expectedResetAt = addMonths(startDate, 1).getTime();
	expect(
		Math.abs((entitlement?.next_reset_at ?? 0) - expectedResetAt) <
			ms.minutes(10),
	).toBe(true);
};

const stripeResponse = <T extends object>({
	object,
	requestId,
}: {
	object: T;
	requestId: string;
}): Stripe.Response<T> => ({
	...object,
	lastResponse: {
		headers: {},
		requestId,
		statusCode: 200,
	},
});

export const triggerSubscriptionCreated = async ({
	ctx,
	stripeSubId,
	scheduleId,
}: {
	ctx: TestContext;
	stripeSubId: string;
	scheduleId?: string | null;
}) => {
	const subscription = {
		id: stripeSubId,
		object: "subscription",
		schedule: scheduleId ?? null,
	} as Stripe.Subscription;
	const retrieveSubscription: Stripe.SubscriptionsResource["retrieve"] = async () =>
		stripeResponse({ object: subscription, requestId: `req_${stripeSubId}` });

	const stripeCli = {
		...ctx.stripeCli,
		subscriptions: {
			...ctx.stripeCli.subscriptions,
			retrieve: retrieveSubscription,
		},
	} as Stripe;

	const stripeEvent: Stripe.CustomerSubscriptionCreatedEvent = {
		id: `evt_${stripeSubId}`,
		object: "event",
		api_version: null,
		created: Math.floor(Date.now() / 1000),
		data: {
			object: subscription,
		},
		livemode: false,
		pending_webhooks: 0,
		request: null,
		type: "customer.subscription.created",
	};

	await handleSubCreated({
		ctx: {
			...ctx,
			stripeCli,
			stripeEvent,
		} satisfies StripeWebhookContext,
	});
};
