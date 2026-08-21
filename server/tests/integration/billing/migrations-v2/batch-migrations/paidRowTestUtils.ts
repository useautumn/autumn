import { expect } from "bun:test";
import {
	BillWhen,
	BillingInterval,
	BillingType,
	type EntInterval,
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers as customersTable,
	entitlements,
	Infinite,
	prices,
	products as productsTable,
	PriceType,
} from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";
import type { ScenarioCtx } from "./batchTestUtils";

/** Org/env-scoped: unscoped customer_id reads can hit stale twins left by
 * earlier runs in other test orgs. */
export const readScopedFeatureRow = async ({
	ctx,
	customerId,
	featureId,
	interval,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
	interval?: EntInterval | null;
}) => {
	const [result] = await ctx.db
		.select({ row: customerEntitlements })
		.from(customerEntitlements)
		.innerJoin(
			customerProducts,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.innerJoin(
			customersTable,
			eq(customerProducts.internal_customer_id, customersTable.internal_id),
		)
		.innerJoin(
			entitlements,
			eq(customerEntitlements.entitlement_id, entitlements.id),
		)
		.where(
			and(
				eq(customersTable.org_id, ctx.org.id),
				eq(customersTable.env, ctx.env),
				eq(customersTable.id, customerId),
				eq(customerEntitlements.feature_id, featureId),
				interval === undefined
					? undefined
					: interval === null
						? isNull(entitlements.interval)
						: eq(entitlements.interval, interval),
			),
		);
	if (!result) {
		throw new Error(`Expected a ${featureId} row for ${customerId}`);
	}
	return result.row;
};

/** Points the customer's row at a custom copy of its catalog definition.
 * Empty overrides mean an exact copy — entsAreSame treats it as the same item. */
export const repointToCustomEntitlement = async ({
	ctx,
	customerId,
	featureId,
	overrides = {},
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
	overrides?: Partial<typeof entitlements.$inferInsert>;
}) => {
	const row = await readScopedFeatureRow({ ctx, customerId, featureId });

	const [catalogEntitlement] = await ctx.db
		.select()
		.from(entitlements)
		.where(eq(entitlements.id, row.entitlement_id));

	const customId = generateId("ent");
	await ctx.db.insert(entitlements).values({
		...catalogEntitlement,
		id: customId,
		is_custom: true,
		...overrides,
	});
	await ctx.db
		.update(customerEntitlements)
		.set({ entitlement_id: customId })
		.where(eq(customerEntitlements.id, row.id));

	return customId;
};

/** Hangs a paid price off whatever definition the customer's row currently
 * points at — the shape a free→paid customization leaves behind. The price
 * config is cloned from a catalog template plan so it parses everywhere. */
export const attachCustomerPaidPrice = async ({
	ctx,
	customerId,
	featureId,
	templatePlanId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
	templatePlanId: string;
}): Promise<{ priceId: string; customerPriceId: string }> => {
	const row = await readScopedFeatureRow({ ctx, customerId, featureId });
	if (!row.customer_product_id) {
		throw new Error(`Expected a customer product on the ${featureId} row`);
	}

	const [cp] = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, row.customer_product_id));
	if (!cp) throw new Error(`Expected customer product for ${customerId}`);

	const [template] = await ctx.db
		.select({ price: prices })
		.from(prices)
		.innerJoin(
			productsTable,
			eq(productsTable.internal_id, prices.internal_product_id),
		)
		.where(
			and(
				eq(productsTable.id, templatePlanId),
				eq(productsTable.org_id, ctx.org.id),
				eq(productsTable.env, ctx.env),
			),
		);
	if (!template) {
		throw new Error(`Expected a template price on ${templatePlanId}`);
	}

	const priceId = generateId("pr");
	await ctx.db.insert(prices).values({
		...template.price,
		id: priceId,
		internal_product_id: cp.internal_product_id,
		entitlement_id: row.entitlement_id,
		is_custom: true,
		created_at: Date.now(),
	});

	const customerPriceId = generateId("cus_price");
	await ctx.db.insert(customerPrices).values({
		id: customerPriceId,
		created_at: Date.now(),
		price_id: priceId,
		internal_customer_id: cp.internal_customer_id,
		customer_product_id: cp.id,
	});

	return { priceId, customerPriceId };
};

/** Hangs a DB-only usage price off the live row so rowIsUnpaidSql treats it
 * as paid, without minting a Stripe-priced catalog template. */
export const attachSyntheticPaidPrice = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
}): Promise<{ priceId: string; customerPriceId: string }> => {
	const row = await readScopedFeatureRow({ ctx, customerId, featureId });
	if (!row.customer_product_id) {
		throw new Error(`Expected a customer product on the ${featureId} row`);
	}

	const [cp] = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, row.customer_product_id));
	if (!cp) throw new Error(`Expected customer product for ${customerId}`);

	const [definition] = await ctx.db
		.select()
		.from(entitlements)
		.where(eq(entitlements.id, row.entitlement_id));
	if (!definition) {
		throw new Error(`Expected entitlement ${row.entitlement_id}`);
	}

	const priceId = generateId("pr");
	await ctx.db.insert(prices).values({
		id: priceId,
		org_id: ctx.org.id,
		internal_product_id: cp.internal_product_id,
		created_at: Date.now(),
		billing_type: BillingType.UsageInArrear,
		is_custom: true,
		entitlement_id: row.entitlement_id,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			internal_feature_id: definition.internal_feature_id,
			feature_id: featureId,
			usage_tiers: [{ to: Infinite, amount: 1 }],
			interval: BillingInterval.Month,
			interval_count: 1,
			billing_units: 1,
			should_prorate: false,
		},
	});

	const customerPriceId = generateId("cus_price");
	await ctx.db.insert(customerPrices).values({
		id: customerPriceId,
		created_at: Date.now(),
		price_id: priceId,
		internal_customer_id: cp.internal_customer_id,
		customer_product_id: cp.id,
	});

	return { priceId, customerPriceId };
};

export const expectCustomerPriceSurvives = async ({
	ctx,
	customerPriceId,
}: {
	ctx: ScenarioCtx;
	customerPriceId: string;
}) => {
	const rows = await ctx.db
		.select({ id: customerPrices.id })
		.from(customerPrices)
		.where(eq(customerPrices.id, customerPriceId));
	expect(
		rows,
		`Expected customer_price ${customerPriceId} to survive`,
	).toHaveLength(1);
};

export const setScopedFeatureBalance = async ({
	ctx,
	customerId,
	featureId,
	balance,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
	balance: number;
}) => {
	const row = await readScopedFeatureRow({ ctx, customerId, featureId });
	await ctx.db
		.update(customerEntitlements)
		.set({ balance })
		.where(eq(customerEntitlements.id, row.id));
	return { ...row, balance };
};

export const expectReplacedFeatureRowCorrect = async ({
	ctx,
	customerId,
	featureId,
	beforeRowId,
	beforeEntitlementId,
	balance,
	interval,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
	beforeRowId: string;
	beforeEntitlementId: string;
	balance: number;
	interval?: EntInterval | null;
}) => {
	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId,
		interval,
	});
	expect(after.id, `expected in-place replace for ${customerId}`).toBe(
		beforeRowId,
	);
	expect(after.entitlement_id).not.toBe(beforeEntitlementId);
	expect(after.balance).toBe(balance);
};

export const expectFeatureRowUnchanged = async ({
	ctx,
	customerId,
	featureId,
	beforeRowId,
	beforeEntitlementId,
	balance,
	interval,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
	beforeRowId: string;
	beforeEntitlementId: string;
	balance: number;
	interval?: EntInterval | null;
}) => {
	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId,
		interval,
	});
	expect(after.id, `expected spared row for ${customerId}`).toBe(beforeRowId);
	expect(after.entitlement_id).toBe(beforeEntitlementId);
	expect(after.balance).toBe(balance);
};
