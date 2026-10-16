import { type Customer, RELEVANT_STATUSES } from "@autumn/shared";
import type { Context, Next } from "hono";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { stripeEventToStripeSubscriptionId } from "@/external/stripe/common/utils/stripeEventToStripeSubscriptionId.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { CusService } from "../../../internal/customers/CusService";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext";

const getAutumnCustomer = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<Customer | undefined> => {
	const { stripeEvent } = ctx;

	// 1. Get stripe customer ID from stripe event
	const getStripeCustomerId = () => {
		switch (stripeEvent.type) {
			case "customer.subscription.created":
			case "customer.subscription.updated":
			case "customer.subscription.deleted":
			case "checkout.session.completed":
			case "checkout.session.expired":
			case "invoice.paid":
			case "invoice.updated":
			case "invoice.created":
			case "invoice.finalized":
			case "subscription_schedule.canceled":
			case "subscription_schedule.released":
			case "subscription_schedule.updated":
				return stripeEvent.data.object.customer;

			case "customer.updated":
			case "customer.discount.deleted":
				return stripeEvent.data.object.id;
		}
	};

	const stripeCustomerId = getStripeCustomerId();
	if (!stripeCustomerId) return undefined;

	// 2. Several Autumn customers can share one Stripe customer, so match on the event's subscription first
	const stripeSubscriptionId = stripeEventToStripeSubscriptionId({
		stripeEvent,
	});
	const customersOnSubscription = stripeSubscriptionId
		? await CusService.listByStripeSubscriptionId({
				ctx,
				stripeSubscriptionId,
			})
		: [];

	// The payer is linked to the Stripe customer; among several linked ones, take the oldest plan on the subscription
	const owningCustomer =
		customersOnSubscription.find(
			(customer) => customer.processor?.id === stripeCustomerId,
		) ?? customersOnSubscription[0];

	if (customersOnSubscription.length > 1) {
		ctx.logger.info(
			`[stripeToAutumnCustomer] ${customersOnSubscription.length} customers share subscription ${stripeSubscriptionId}, resolved to ${owningCustomer.id ?? owningCustomer.internal_id}`,
		);
	}

	const customer =
		owningCustomer ??
		(await CusService.getByStripeId({
			ctx,
			stripeId: stripeCustomerId as string,
		}));

	return customer ?? undefined;
};

/**
 * Points a webhook ctx at one customer: lands its balance-worker writes, loads it onto
 * ctx.fullCustomer and routes to its Redis. Returns a new ctx; the given one is untouched.
 */
export const withStripeEventCustomer = async ({
	ctx,
	customer,
}: {
	ctx: StripeWebhookContext;
	customer: Customer;
}): Promise<StripeWebhookContext> => {
	// The worker holds the live balances: land its writes first, so a cycle's arrears and resets read all of the usage.
	if (
		customer.id &&
		isBalanceWorkerRolloutEnabled({ ctx, customerId: customer.id })
	)
		await flushBalanceWorkerCustomer({ ctx, customerId: customer.id });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customer.internal_id,
		withEntities: true,
		withSubs: true,
		inStatuses: RELEVANT_STATUSES,
		allowNotFound: true,
	});

	const customerId = fullCustomer?.id || fullCustomer?.internal_id || undefined;
	if (!customerId) return { ...ctx, fullCustomer };

	const { ctx: routedCtx } = getCtxWithCustomerRedis({
		ctx: {
			...ctx,
			fullCustomer,
			customerId,
		},
		customerId,
	});
	return routedCtx;
};

/**
 * Resolves the event's Autumn customer onto ctx.fullCustomer and returns a
 * ctx routed to that customer's Redis. Shared by the webhook route and the
 * SQS replay worker.
 */
export const attachStripeEventCustomer = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<StripeWebhookContext> => {
	const customer = await getAutumnCustomer({ ctx });
	if (!customer) return ctx;

	const routedCtx = await withStripeEventCustomer({ ctx, customer });
	ctx.fullCustomer = routedCtx.fullCustomer;
	return routedCtx.customerId ? routedCtx : ctx;
};

export const stripeToAutumnCustomerMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx") as StripeWebhookContext;
	const routedCtx = await attachStripeEventCustomer({ ctx });
	if (routedCtx !== ctx) c.set("ctx", routedCtx);

	await next();
};
