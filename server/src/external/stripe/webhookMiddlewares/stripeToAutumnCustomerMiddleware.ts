import { RELEVANT_STATUSES } from "@autumn/shared";
import type { Context, Next } from "hono";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import { CusService } from "../../../internal/customers/CusService";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext";

const getAutumnCustomerId = async ({ ctx }: { ctx: StripeWebhookContext }) => {
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
			case "subscription_schedule.updated":
				return stripeEvent.data.object.customer;

			case "customer.updated":
			case "customer.discount.deleted":
				return stripeEvent.data.object.id;
		}
	};

	const stripeCustomerId = getStripeCustomerId();
	if (!stripeCustomerId) return;

	const cus = await CusService.getByStripeId({
		ctx,
		stripeId: stripeCustomerId as string,
	});

	if (!cus) return;

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: cus.internal_id,
		withEntities: true,
		withSubs: true,
		inStatuses: RELEVANT_STATUSES,
		allowNotFound: true,
	});

	ctx.fullCustomer = fullCustomer;
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
	await getAutumnCustomerId({ ctx });

	const customerId =
		ctx.fullCustomer?.id || ctx.fullCustomer?.internal_id || undefined;

	if (!customerId) return ctx;

	const { ctx: routedCtx } = getCtxWithCustomerRedis({
		ctx: {
			...ctx,
			customerId,
			rolloutSnapshot: computeRolloutSnapshot({
				orgId: ctx.org.id,
				customerId,
			}),
		},
		customerId,
	});
	return routedCtx;
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
