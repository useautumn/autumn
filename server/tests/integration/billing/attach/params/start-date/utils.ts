import { expect } from "bun:test";
import { type FullCusProduct, ms } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { addMonths, getUnixTime } from "date-fns";
import type Stripe from "stripe";
import { handleSubCreated } from "@/external/stripe/webhookHandlers/handleSubCreated";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";

export const getCustomerProduct = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: Parameters<typeof CusService.getFull>[0]["ctx"];
	customerId: string;
	productId: string;
	entityId?: string;
}): Promise<FullCusProduct> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProduct = fullCustomer.customer_products.find(
		(cp) =>
			cp.product_id === productId &&
			(entityId === undefined || cp.entity_id === entityId),
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
	subscriptionCreatedAtMs,
	fullCustomer,
}: {
	ctx: TestContext;
	stripeSubId: string;
	scheduleId?: string | null;
	subscriptionCreatedAtMs?: number;
	fullCustomer?: StripeWebhookContext["fullCustomer"];
}) => {
	const subscription = {
		id: stripeSubId,
		object: "subscription",
		created: getUnixTime(subscriptionCreatedAtMs ?? Date.now()),
		schedule: scheduleId ?? null,
	} as Stripe.Subscription;
	const retrieveSubscription: Stripe.SubscriptionsResource["retrieve"] =
		async () =>
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
		created: getUnixTime(Date.now()),
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
			fullCustomer,
			stripeCli,
			stripeEvent,
		} satisfies StripeWebhookContext,
	});
};
