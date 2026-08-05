import { expect } from "bun:test";
import {
	CusProductStatus,
	customerEntitlements,
	customerPrices,
	customerProducts,
	prices,
} from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { DEFAULT_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
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

type CustomerProductRow = { productId: string | null; status: string | null };

/** Stable, human-readable rendering so a mismatch names the offending rows. */
const formatRows = (rows: CustomerProductRow[]) =>
	rows
		.map((row) => `${row.productId}:${row.status}`)
		.sort()
		.join(", ") || "(none)";

const rowsWithStatus = (rows: CustomerProductRow[], status: CusProductStatus) =>
	rows.filter((row) => row.status === status);

const expectedRows = (productIds: string[], status: CusProductStatus) =>
	formatRows(productIds.map((productId) => ({ productId, status })));

/**
 * Assert the exact set of active/scheduled `customer_products` rows for a
 * customer, polling until it settles — a create_schedule / phase transition
 * lands its rows through Stripe execution and its webhooks, so the first read
 * can still show the pre-transition set. The failure message carries every row
 * that was actually present, which a bare `toEqual` diff does not survive into
 * the `bun tw` report.
 */
export const expectCustomerProductRows = async ({
	ctx,
	customerId,
	productIds,
	active = [],
	scheduled = [],
	settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: {
	ctx: Ctx;
	customerId: string;
	productIds: string[];
	active?: string[];
	scheduled?: string[];
	settleTimeoutMs?: number;
}) => {
	const expectedActive = expectedRows(active, CusProductStatus.Active);
	const expectedScheduled = expectedRows(scheduled, CusProductStatus.Scheduled);

	await pollUntilAsserted({
		fetch: () => getCustomerProductRows({ ctx, customerId, productIds }),
		assert: (rows) => {
			const allRows = formatRows(rows);
			expect(
				formatRows(rowsWithStatus(rows, CusProductStatus.Active)),
				`Active customer_products for ${customerId} — all rows: [${allRows}]`,
			).toBe(expectedActive);
			expect(
				formatRows(rowsWithStatus(rows, CusProductStatus.Scheduled)),
				`Scheduled customer_products for ${customerId} — all rows: [${allRows}]`,
			).toBe(expectedScheduled);
		},
		timeoutMs: settleTimeoutMs,
	});
};

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
