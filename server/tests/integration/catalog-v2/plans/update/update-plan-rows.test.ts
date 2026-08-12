/**
 * catalogV2.update — claim / row carry-over (definition-exact → same row ids;
 * any change mints new rows; old deleted without customers, or retired +
 * is_custom with customers).
 *
 * Customer refs are DB-seeded: the local Stripe Connect account is currently
 * unreachable from s.customer / attach, which would otherwise fail before the
 * catalog assert runs.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	entitlements,
	isFixedPrice,
	prices,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { expectCatalogResultsCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const getFull = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const entByFeature = async ({
	ctx,
	planId,
	featureId,
}: {
	ctx: AutumnContext;
	planId: string;
	featureId: string;
}) => {
	const full = await getFull({ ctx, planId });
	return full.entitlements.find((ent) => ent.feature.id === featureId);
};

const basePriceRow = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const full = await getFull({ ctx, planId });
	return full.prices.find(isFixedPrice);
};

const fetchEntRow = async ({
	ctx,
	entId,
}: {
	ctx: AutumnContext;
	entId: string;
}) => {
	const [row] = await ctx.db
		.select()
		.from(entitlements)
		.where(eq(entitlements.id, entId))
		.limit(1);
	return row ?? null;
};

const fetchPriceRow = async ({
	ctx,
	priceId,
}: {
	ctx: AutumnContext;
	priceId: string;
}) => {
	const [row] = await ctx.db
		.select()
		.from(prices)
		.where(eq(prices.id, priceId))
		.limit(1);
	return row ?? null;
};

/** Minimal customer + cus_product (+ optional cus_ent / cus_price) for protect refs. */
const seedCustomerProductRef = async ({
	ctx,
	planId,
	status = CusProductStatus.Active,
	entitlementId,
	internalFeatureId,
	priceId,
}: {
	ctx: AutumnContext;
	planId: string;
	status?: CusProductStatus;
	entitlementId?: string;
	internalFeatureId?: string;
	priceId?: string;
}) => {
	const full = await getFull({ ctx, planId });
	const customerId = uniqueTestId("cv2_cus");
	const internalCustomerId = generateId("cus");
	const cusProductId = generateId("cus_prod");

	await ctx.db.insert(customers).values({
		internal_id: internalCustomerId,
		id: customerId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: customerId,
		email: `${customerId}@test.com`,
	});

	await ctx.db.insert(customerProducts).values({
		id: cusProductId,
		internal_customer_id: internalCustomerId,
		product_id: planId,
		internal_product_id: full.internal_id,
		status,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: false,
	});

	if (entitlementId && internalFeatureId) {
		await ctx.db.insert(customerEntitlements).values({
			id: generateId("cus_ent"),
			customer_product_id: cusProductId,
			entitlement_id: entitlementId,
			internal_customer_id: internalCustomerId,
			internal_feature_id: internalFeatureId,
			balance: 100,
			created_at: Date.now(),
		});
	}

	if (priceId) {
		await ctx.db.insert(customerPrices).values({
			id: generateId("cus_price"),
			created_at: Date.now(),
			price_id: priceId,
			internal_customer_id: internalCustomerId,
			customer_product_id: cusProductId,
		});
	}

	return { customerId, internalCustomerId, cusProductId };
};

const cleanupPlanRefs = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const full = await getFull({ ctx, planId }).catch(() => null);
	if (!full) {
		await deleteDbPlans({ ctx, planIds: [planId] });
		return;
	}
	await ctx.db
		.delete(customerProducts)
		.where(eq(customerProducts.internal_product_id, full.internal_id));
	await deleteDbPlans({ ctx, planIds: [planId] });
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: base price change keeps feature rows; old base deleted (no customers)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_base");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Rows Base",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
							{ feature_id: TestFeature.Dashboard },
						],
					},
				],
			});

			const before = await getFull({ ctx, planId });
			const beforeEntIds = before.entitlements.map((ent) => ent.id).sort();
			const beforeFeaturePriceIds = before.prices
				.filter((price) => !isFixedPrice(price))
				.map((price) => price.id)
				.sort();
			const oldBaseId = before.prices.find(isFixedPrice)?.id;
			expect(oldBaseId).toBeDefined();

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 40, interval: BillingInterval.Month },
					},
				],
			});

			const after = await getFull({ ctx, planId });
			expect(after.entitlements.map((ent) => ent.id).sort()).toEqual(
				beforeEntIds,
			);
			expect(
				after.prices
					.filter((price) => !isFixedPrice(price))
					.map((price) => price.id)
					.sort(),
			).toEqual(beforeFeaturePriceIds);
			const newBase = after.prices.find(isFixedPrice);
			expect(newBase?.id).not.toBe(oldBaseId);
			expect((newBase?.config as { amount?: number })?.amount).toBe(40);
			expect(await fetchPriceRow({ ctx, priceId: oldBaseId! })).toBeNull();
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: remove item deletes removed rows; remaining stable (no customers)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_rm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Rows Remove",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
							{ feature_id: TestFeature.Dashboard },
						],
					},
				],
			});

			const beforeDash = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Dashboard,
			});
			const beforeMsg = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});
			expect(beforeDash).toBeDefined();
			expect(beforeMsg).toBeDefined();

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const afterMsg = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});
			expect(afterMsg?.id).toBe(beforeMsg?.id);
			expect(
				await entByFeature({
					ctx,
					planId,
					featureId: TestFeature.Dashboard,
				}),
			).toBeUndefined();
			expect(await fetchEntRow({ ctx, entId: beforeDash!.id })).toBeNull();
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: included bump mints new ent; old deleted (no customers)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_incl");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Rows Incl",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			const oldEnt = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 250,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const newEnt = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});
			expect(newEnt?.id).not.toBe(oldEnt?.id);
			expect(newEnt?.allowance).toBe(250);
			expect(await fetchEntRow({ ctx, entId: oldEnt!.id })).toBeNull();
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED: executeUpsertProducts ignores entitlementPricesPlan.retired (no is_custom stamp)
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 rows: with customer — included bump retires old ent (is_custom)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_cus_incl");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Cus Incl",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const oldEnt = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});
			expect(oldEnt).toBeDefined();

			await seedCustomerProductRef({
				ctx,
				planId,
				entitlementId: oldEnt!.id,
				internalFeatureId: oldEnt!.internal_feature_id,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 200,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const newEnt = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});
			expect(newEnt?.id).not.toBe(oldEnt?.id);
			expect(newEnt?.allowance).toBe(200);
			expect(newEnt?.is_custom).toBe(false);

			const retired = await fetchEntRow({ ctx, entId: oldEnt!.id });
			expect(retired).toBeTruthy();
			expect(retired?.is_custom).toBe(true);

			const [cusEnt] = await ctx.db
				.select()
				.from(customerEntitlements)
				.where(eq(customerEntitlements.entitlement_id, oldEnt!.id))
				.limit(1);
			expect(cusEnt).toBeDefined();
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// RED: executeUpsertProducts ignores entitlementPricesPlan.retired (no is_custom stamp)
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 rows: with customer — remove item retires rows; customer keeps grant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_cus_rm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Cus Remove",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
							{ feature_id: TestFeature.Dashboard },
						],
					},
				],
			});

			const oldDash = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Dashboard,
			});
			expect(oldDash).toBeDefined();

			await seedCustomerProductRef({
				ctx,
				planId,
				entitlementId: oldDash!.id,
				internalFeatureId: oldDash!.internal_feature_id,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			expect(
				await entByFeature({
					ctx,
					planId,
					featureId: TestFeature.Dashboard,
				}),
			).toBeUndefined();

			const retired = await fetchEntRow({ ctx, entId: oldDash!.id });
			expect(retired).toBeTruthy();
			expect(retired?.is_custom).toBe(true);

			const [cusEnt] = await ctx.db
				.select()
				.from(customerEntitlements)
				.where(eq(customerEntitlements.entitlement_id, oldDash!.id))
				.limit(1);
			expect(cusEnt).toBeDefined();
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// RED: executeUpsertProducts ignores entitlementPricesPlan.retired (no is_custom stamp)
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 rows: with customer — base price change retires old base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_cus_base");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Cus Base",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const oldBase = await basePriceRow({ ctx, planId });
			expect((oldBase?.config as { amount?: number })?.amount).toBe(20);

			await seedCustomerProductRef({
				ctx,
				planId,
				priceId: oldBase!.id,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 35, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const newBase = await basePriceRow({ ctx, planId });
			expect(newBase?.id).not.toBe(oldBase?.id);
			expect((newBase?.config as { amount?: number })?.amount).toBe(35);
			expect(newBase?.is_custom).toBe(false);

			const retired = await fetchPriceRow({ ctx, priceId: oldBase!.id });
			expect(retired).toBeTruthy();
			expect(retired?.is_custom).toBe(true);

			const [cusPrice] = await ctx.db
				.select()
				.from(customerPrices)
				.where(eq(customerPrices.price_id, oldBase!.id))
				.limit(1);
			expect(cusPrice).toBeDefined();
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// RED: protectReferencedRows uses hasAnyCustomerProducts (includes expired);
// SPEC wants expired-only treated as no-customers (hard-delete).
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 rows: expired-only customers → rows deleted (not retired)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_exp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Expired Only",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const oldEnt = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});

			await seedCustomerProductRef({
				ctx,
				planId,
				status: CusProductStatus.Expired,
				entitlementId: oldEnt!.id,
				internalFeatureId: oldEnt!.internal_feature_id,
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 200,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			const entry = preview.plans.find((p) => p.plan_id === planId);
			expect(entry?.state.has_customers).toBe(false);

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 200,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});

			const newEnt = await entByFeature({
				ctx,
				planId,
				featureId: TestFeature.Messages,
			});
			expect(newEnt?.id).not.toBe(oldEnt?.id);
			expect(newEnt?.allowance).toBe(200);
			expect(await fetchEntRow({ ctx, entId: oldEnt!.id })).toBeNull();
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);
