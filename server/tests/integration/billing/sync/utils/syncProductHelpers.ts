import { type FullProduct, isFixedPrice, isPrepaidPrice } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

export const fetchFullProduct = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}): Promise<FullProduct> =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

export const getStripeCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<string> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}
	return stripeCustomerId;
};

export const getProductStripeProductId = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): string => {
	const id = fullProduct.processor?.id;
	if (!id) {
		throw new Error(`Product ${fullProduct.id} has no processor.id`);
	}
	return id;
};

export const getBaseStripePriceId = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): string => {
	const fixedPrice = fullProduct.prices.find((p) => isFixedPrice(p));
	if (!fixedPrice) {
		throw new Error(`Product ${fullProduct.id} has no fixed (base) price`);
	}
	const id = fixedPrice.config.stripe_price_id;
	if (!id) {
		throw new Error(`Base price on ${fullProduct.id} has no stripe_price_id`);
	}
	return id;
};

/** Returns the Stripe product id used by the prepaid usage price. */
export const getPrepaidStripeProductId = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): string => {
	const prepaidPrice = fullProduct.prices.find((p) => isPrepaidPrice(p));
	if (!prepaidPrice) {
		throw new Error(`Product ${fullProduct.id} has no prepaid price`);
	}
	const id = prepaidPrice.config.stripe_product_id;
	if (!id) {
		throw new Error(
			`Prepaid price on ${fullProduct.id} has no stripe_product_id`,
		);
	}
	return id;
};

export const createStripeFixedPriceUnderProduct = async ({
	ctx,
	stripeProductId,
	unitAmount,
	currency = "usd",
	interval = "month",
}: {
	ctx: TestContext;
	stripeProductId: string;
	unitAmount: number;
	currency?: string;
	interval?: "day" | "week" | "month" | "year";
}): Promise<Stripe.Price> =>
	ctx.stripeCli.prices.create({
		product: stripeProductId,
		unit_amount: unitAmount,
		currency,
		recurring: { interval },
	});

export const createStripeTieredPriceUnderProduct = async ({
	ctx,
	stripeProductId,
	tiers,
	tiersMode = "graduated",
	currency = "usd",
	interval = "month",
}: {
	ctx: TestContext;
	stripeProductId: string;
	tiers: Stripe.PriceCreateParams.Tier[];
	tiersMode?: "graduated" | "volume";
	currency?: string;
	interval?: "day" | "week" | "month" | "year";
}): Promise<Stripe.Price> =>
	ctx.stripeCli.prices.create({
		product: stripeProductId,
		currency,
		recurring: { interval, usage_type: "metered" },
		billing_scheme: "tiered",
		tiers_mode: tiersMode,
		tiers,
	});

/**
 * Create a Stripe subscription schedule with the supplied phases and return
 * both the live subscription (running phase 0) and the schedule object.
 * Each phase iterates once over its billing interval; the schedule releases
 * after the final phase.
 */
export const createStripeSubscriptionSchedule = async ({
	ctx,
	customerId,
	phases,
}: {
	ctx: TestContext;
	customerId: string;
	phases: {
		items: { price: string; quantity?: number }[];
		iterations?: number;
	}[];
}): Promise<{
	subscription: Stripe.Subscription;
	schedule: Stripe.SubscriptionSchedule;
}> => {
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });

	const created = await ctx.stripeCli.subscriptionSchedules.create({
		customer: stripeCustomerId,
		start_date: "now",
		end_behavior: "release",
		phases: phases.map((phase) => ({
			items: phase.items,
			duration: { interval: "month", interval_count: phase.iterations ?? 1 },
		})),
	});

	const subscriptionId =
		typeof created.subscription === "string"
			? created.subscription
			: created.subscription?.id;
	if (!subscriptionId) {
		throw new Error(
			`subscriptionSchedules.create did not return a subscription id (schedule ${created.id})`,
		);
	}

	const [subscription, schedule] = await Promise.all([
		ctx.stripeCli.subscriptions.retrieve(subscriptionId),
		ctx.stripeCli.subscriptionSchedules.retrieve(created.id, {
			expand: ["phases.items.price"],
		}),
	]);

	return { subscription, schedule };
};
