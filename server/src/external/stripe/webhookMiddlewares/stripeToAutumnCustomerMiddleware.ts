import { RELEVANT_STATUSES } from "@autumn/shared";
import type { Context, Next } from "hono";
import { CusService } from "../../../internal/customers/CusService";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext";

export const getAutumnCustomerId = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { stripeEvent } = ctx;

	// 1. Get stripe customer ID from stripe event
	const getStripeCustomerId = () => {
		switch (stripeEvent.type) {
			case "customer.subscription.created":
			case "customer.subscription.updated":
			case "customer.subscription.deleted":
			case "checkout.session.completed":
			case "invoice.paid":
			case "invoice.updated":
			case "invoice.created":
			case "invoice.finalized":
			case "subscription_schedule.canceled":
				return stripeEvent.data.object.customer;

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
		db: ctx.db,
		idOrInternalId: cus.internal_id,
		orgId: ctx.org.id,
		env: ctx.env,
		withEntities: true,
		withSubs: true,
		inStatuses: RELEVANT_STATUSES,
		allowNotFound: true,
	});

	ctx.fullCustomer = fullCustomer;
};

export const stripeToAutumnCustomerMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx") as StripeWebhookContext;
	await getAutumnCustomerId({ ctx });
	await next();
};
