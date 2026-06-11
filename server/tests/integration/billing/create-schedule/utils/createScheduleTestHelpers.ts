import {
	customerEntitlements,
	customerPrices,
	customerProducts,
	prices,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { and, eq, inArray } from "drizzle-orm";

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
