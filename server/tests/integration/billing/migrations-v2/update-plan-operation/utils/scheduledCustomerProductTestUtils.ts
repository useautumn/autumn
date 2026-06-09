import {
	CusProductStatus,
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	prices,
	products as productsTable,
	schedulePhases,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { and, eq, inArray, isNull } from "drizzle-orm";

export type MigrationTestCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

export const getCustomerProductRows = async ({
	ctx,
	customerId,
	productId,
	status,
	entityId,
}: {
	ctx: MigrationTestCtx;
	customerId: string;
	productId: string;
	status?: CusProductStatus;
	entityId?: string | null;
}) =>
	await ctx.db
		.select({
			id: customerProducts.id,
			status: customerProducts.status,
			startsAt: customerProducts.starts_at,
			scheduledIds: customerProducts.scheduled_ids,
			isCustom: customerProducts.is_custom,
			entityId: customerProducts.entity_id,
			options: customerProducts.options,
			version: productsTable.version,
		})
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.innerJoin(
			productsTable,
			eq(customerProducts.internal_product_id, productsTable.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerProducts.product_id, productId),
				status ? eq(customerProducts.status, status) : undefined,
				entityId === undefined
					? undefined
					: entityId === null
						? isNull(customerProducts.entity_id)
						: eq(customerProducts.entity_id, entityId),
			),
		);

export const getScheduledCustomerProductRow = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: MigrationTestCtx;
	customerId: string;
	productId: string;
	entityId?: string | null;
}) => {
	const rows = await getCustomerProductRows({
		ctx,
		customerId,
		productId,
		status: CusProductStatus.Scheduled,
		entityId,
	});
	if (rows.length !== 1) {
		throw new Error(
			`Expected exactly one scheduled customer product for ${customerId}/${productId}, got ${rows.length}`,
		);
	}
	return rows[0]!;
};

export const getScheduledCustomerProductRows = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: MigrationTestCtx;
	customerId: string;
	productId: string;
}) =>
	await getCustomerProductRows({
		ctx,
		customerId,
		productId,
		status: CusProductStatus.Scheduled,
	});

export const getCustomerProductFeatureIds = async ({
	ctx,
	customerProductId,
}: {
	ctx: MigrationTestCtx;
	customerProductId: string;
}) =>
	(
		await ctx.db
			.select({ featureId: customerEntitlements.feature_id })
			.from(customerEntitlements)
			.where(eq(customerEntitlements.customer_product_id, customerProductId))
	)
		.map((row) => row.featureId)
		.sort();

export const getCustomerProductBalances = async ({
	ctx,
	customerProductId,
}: {
	ctx: MigrationTestCtx;
	customerProductId: string;
}) =>
	(
		await ctx.db
			.select({
				featureId: customerEntitlements.feature_id,
				balance: customerEntitlements.balance,
			})
			.from(customerEntitlements)
			.where(eq(customerEntitlements.customer_product_id, customerProductId))
	).sort((a, b) => (a.featureId ?? "").localeCompare(b.featureId ?? ""));

export const getCustomerProductPriceAmounts = async ({
	ctx,
	customerProductId,
}: {
	ctx: MigrationTestCtx;
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

export const getPhaseCustomerProductIds = async ({
	ctx,
	customerProductId,
}: {
	ctx: MigrationTestCtx;
	customerProductId: string;
}) =>
	(
		await ctx.db
			.select({ customerProductIds: schedulePhases.customer_product_ids })
			.from(schedulePhases)
	)
		.map((phase) => phase.customerProductIds)
		.find((customerProductIds) =>
			customerProductIds.includes(customerProductId),
		);

export const getRequiredStripeScheduleId = ({
	scheduledIds,
}: {
	scheduledIds: string[] | null;
}) => {
	const scheduleId = scheduledIds?.[0];
	if (!scheduleId) {
		throw new Error("Expected customer product to have a Stripe schedule ID");
	}
	return scheduleId;
};

export const deleteCustomerProductRows = async ({
	ctx,
	customerProductIds,
}: {
	ctx: MigrationTestCtx;
	customerProductIds: string[];
}) => {
	if (customerProductIds.length === 0) return;
	await ctx.db
		.delete(customerProducts)
		.where(inArray(customerProducts.id, customerProductIds));
};

export const expectNoCustomerProductRow = async ({
	ctx,
	customerProductId,
}: {
	ctx: MigrationTestCtx;
	customerProductId: string;
}) => {
	const rows = await ctx.db
		.select({ id: customerProducts.id })
		.from(customerProducts)
		.where(eq(customerProducts.id, customerProductId));
	if (rows.length !== 0) {
		throw new Error(`Expected customer product ${customerProductId} to be deleted`);
	}
};
