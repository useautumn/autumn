import {
	customerEntitlements,
	customerPrices,
	customerProducts,
	prices,
	products,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";

type Ctx = Awaited<ReturnType<typeof initScenario>>["ctx"];

export const getCustomerProductRows = async ({
	ctx,
	customerId,
	productIds,
}: {
	ctx: Ctx;
	customerId: string;
	productIds: string[];
}) =>
	await ctx.db
		.select({
			productId: customerProducts.product_id,
			status: customerProducts.status,
		})
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.customer_id, customerId),
				inArray(customerProducts.product_id, productIds),
			),
		);

export const getCustomerProductPriceAmounts = async ({
	ctx,
	customerProductId,
}: {
	ctx: Ctx;
	customerProductId: string;
}) =>
	(
		await ctx.db
			.select({ config: prices.config })
			.from(customerPrices)
			.innerJoin(prices, eq(customerPrices.price_id, prices.id))
			.where(eq(customerPrices.customer_product_id, customerProductId))
	)
		.map((row) =>
			row.config && "amount" in row.config ? row.config.amount : undefined,
		)
		.filter((amount): amount is number => typeof amount === "number")
		.sort((a, b) => a - b);

export const getCustomerProductFeaturePriceAmounts = async ({
	ctx,
	customerProductId,
	featureId,
}: {
	ctx: Ctx;
	customerProductId: string;
	featureId: string;
}) =>
	(
		await ctx.db
			.select({ config: prices.config })
			.from(customerPrices)
			.innerJoin(prices, eq(customerPrices.price_id, prices.id))
			.where(eq(customerPrices.customer_product_id, customerProductId))
	)
		.flatMap((row) => {
			const config = row.config;
			if (
				!config ||
				!("feature_id" in config) ||
				config.feature_id !== featureId ||
				!("usage_tiers" in config) ||
				!Array.isArray(config.usage_tiers)
			) {
				return [];
			}

			return config.usage_tiers
				.map((tier) => tier.amount)
				.filter((amount): amount is number => typeof amount === "number");
		})
		.sort((a, b) => a - b);

export const getCustomerProductEntitlementBalances = async ({
	ctx,
	customerProductId,
}: {
	ctx: Ctx;
	customerProductId: string;
}) =>
	await ctx.db
		.select({
			feature_id: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
		})
		.from(customerEntitlements)
		.where(eq(customerEntitlements.customer_product_id, customerProductId));

export const getRequiredScheduleId = (scheduleId: string | null) => {
	if (!scheduleId) {
		throw new Error("Expected create_schedule response to include schedule_id");
	}

	return scheduleId;
};

export const getCheckoutId = (paymentUrl: string | null | undefined) => {
	if (!paymentUrl) {
		throw new Error("Expected create_schedule response to include payment_url");
	}

	const checkoutId = paymentUrl.split("/c/")[1];

	if (!checkoutId) {
		throw new Error(`Expected Autumn checkout URL, received: ${paymentUrl}`);
	}

	return checkoutId;
};

export const getProductStripeId = async ({
	ctx,
	productId,
}: {
	ctx: Ctx;
	productId: string;
}) => {
	const [product] = await ctx.db
		.select({ processor: products.processor })
		.from(products)
		.where(
			and(
				eq(products.id, productId),
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
			),
		);

	return product?.processor?.id ?? null;
};

type StripePhasePrice = {
	productId: string;
	unitAmount: number | null;
	active: boolean;
};

const toStripePhasePrice = (price: Stripe.Price): StripePhasePrice => ({
	productId:
		typeof price.product === "string" ? price.product : price.product.id,
	unitAmount: price.unit_amount,
	active: price.active,
});

/** Every phase item price of the customer's Stripe subscription schedules. */
export const getStripeSchedulePhasePrices = async ({
	ctx,
	customerId,
}: {
	ctx: Ctx;
	customerId: string;
}): Promise<StripePhasePrice[]> => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeCustomerId = customer?.processor?.id;
	if (!stripeCustomerId) return [];

	const schedules = await ctx.stripeCli.subscriptionSchedules.list({
		customer: stripeCustomerId,
		limit: 10,
		expand: ["data.phases.items.price"],
	});

	return schedules.data.flatMap((schedule) =>
		schedule.phases.flatMap((phase) =>
			phase.items.map((item) => toStripePhasePrice(item.price as Stripe.Price)),
		),
	);
};
