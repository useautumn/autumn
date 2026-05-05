import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";

/**
 * Mutates a Stripe subscription / its schedule to drift from Autumn's expected
 * state, so that the restore action has work to do. Test-only utility.
 */
export const corruptStripeSubscription = async ({
	ctx,
	subscriptionId,
	mutations,
}: {
	ctx: TestContext;
	subscriptionId: string;
	mutations: {
		removeAllItems?: boolean;
		removeItemPriceIds?: string[];
		addItems?: Array<{ price: string; quantity?: number }>;
		setItemQuantities?: Array<{ priceId: string; quantity: number }>;
		releaseSchedule?: boolean;
	};
}): Promise<Stripe.Subscription> => {
	const sub = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);

	if (mutations.releaseSchedule) {
		const scheduleId =
			typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
		if (scheduleId) {
			await ctx.stripeCli.subscriptionSchedules.release(scheduleId);
		}
	}

	const updateItems: Stripe.SubscriptionUpdateParams.Item[] = [];

	if (mutations.removeAllItems) {
		for (const item of sub.items.data) {
			updateItems.push({ id: item.id, deleted: true });
		}
	}

	if (mutations.removeItemPriceIds?.length) {
		const priceIdSet = new Set(mutations.removeItemPriceIds);
		for (const item of sub.items.data) {
			if (priceIdSet.has(item.price.id)) {
				updateItems.push({ id: item.id, deleted: true });
			}
		}
	}

	if (mutations.setItemQuantities?.length) {
		for (const { priceId, quantity } of mutations.setItemQuantities) {
			const item = sub.items.data.find((i) => i.price.id === priceId);
			if (item) updateItems.push({ id: item.id, quantity });
		}
	}

	if (mutations.addItems?.length) {
		for (const add of mutations.addItems) {
			updateItems.push({ price: add.price, quantity: add.quantity ?? 1 });
		}
	}

	if (updateItems.length === 0) {
		return ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	}

	return ctx.stripeCli.subscriptions.update(subscriptionId, {
		items: updateItems,
		proration_behavior: "none",
	});
};

/**
 * Returns the (single) primary Stripe subscription for a customer in the test
 * environment. Throws if there is more than one or zero.
 */
export const getStripeSubscriptionForCustomer = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
}): Promise<Stripe.Subscription> => {
	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
		limit: 100,
	});
	const active = subs.data.filter(
		(s) => s.status === "active" || s.status === "trialing",
	);
	if (active.length !== 1) {
		throw new Error(
			`Expected exactly 1 active Stripe subscription for customer ${stripeCustomerId}, found ${active.length}`,
		);
	}
	return active[0];
};

export const listActiveStripeSubscriptions = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
}): Promise<Stripe.Subscription[]> => {
	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
		limit: 100,
	});
	return subs.data.filter(
		(s) => s.status === "active" || s.status === "trialing",
	);
};
