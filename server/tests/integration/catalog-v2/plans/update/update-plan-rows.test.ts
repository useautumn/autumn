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
import {
	expectPlanRowsCorrect,
	snapshotPlanRows,
} from "../utils/expectPlanRows.js";

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
	const full = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
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
	const full = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	}).catch(() => null);
	if (full) {
		await ctx.db
			.delete(customerProducts)
			.where(eq(customerProducts.internal_product_id, full.internal_id));
	}
	await deleteDbPlans({ ctx, planIds: [planId] });
};

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

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
						items: [messagesItem(100), { feature_id: TestFeature.Dashboard }],
					},
				],
			});
			const before = await snapshotPlanRows({ ctx, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 40, interval: BillingInterval.Month },
					},
				],
			});

			await expectPlanRowsCorrect({
				ctx,
				before,
				expected: {
					stableEnts: true,
					stableFeaturePrices: true,
					mintedBase: { amount: 40 },
					deletedPrices: [before.basePriceId!],
				},
			});
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
						items: [messagesItem(100), { feature_id: TestFeature.Dashboard }],
					},
				],
			});
			const before = await snapshotPlanRows({ ctx, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, items: [messagesItem(100)] }],
			});

			await expectPlanRowsCorrect({
				ctx,
				before,
				expected: {
					stableEnts: [TestFeature.Messages],
					absentFeatures: [TestFeature.Dashboard],
					deletedEnts: [before.ents[TestFeature.Dashboard].id],
				},
			});
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
					{ plan_id: planId, name: "Rows Incl", items: [messagesItem(100)] },
				],
			});
			const before = await snapshotPlanRows({ ctx, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, items: [messagesItem(250)] }],
			});

			await expectPlanRowsCorrect({
				ctx,
				before,
				expected: {
					mintedEnts: [{ featureId: TestFeature.Messages, allowance: 250 }],
					deletedEnts: [before.ents[TestFeature.Messages].id],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// Retired lane: stamp is_custom so customer refs survive.
test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: with customer — included bump retires old ent (is_custom)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_cus_incl");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planId, name: "Cus Incl", items: [messagesItem(100)] },
				],
			});
			const before = await snapshotPlanRows({ ctx, planId });
			const oldEnt = before.ents[TestFeature.Messages];

			await seedCustomerProductRef({
				ctx,
				planId,
				entitlementId: oldEnt.id,
				internalFeatureId: oldEnt.internalFeatureId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, items: [messagesItem(200)] }],
			});

			await expectPlanRowsCorrect({
				ctx,
				before,
				expected: {
					mintedEnts: [{ featureId: TestFeature.Messages, allowance: 200 }],
					retiredEnts: [oldEnt.id],
					survivingCusEnts: [oldEnt.id],
				},
			});
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// Retired lane: stamp is_custom so customer refs survive.
test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: with customer — remove item retires rows; customer keeps grant")}`,
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
						items: [messagesItem(100), { feature_id: TestFeature.Dashboard }],
					},
				],
			});
			const before = await snapshotPlanRows({ ctx, planId });
			const oldDash = before.ents[TestFeature.Dashboard];

			await seedCustomerProductRef({
				ctx,
				planId,
				entitlementId: oldDash.id,
				internalFeatureId: oldDash.internalFeatureId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, items: [messagesItem(100)] }],
			});

			await expectPlanRowsCorrect({
				ctx,
				before,
				expected: {
					absentFeatures: [TestFeature.Dashboard],
					retiredEnts: [oldDash.id],
					survivingCusEnts: [oldDash.id],
				},
			});
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// Retired lane: stamp is_custom so customer refs survive.
test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: with customer — base price change retires old base")}`,
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
						items: [messagesItem(100)],
					},
				],
			});
			const before = await snapshotPlanRows({ ctx, planId });

			await seedCustomerProductRef({
				ctx,
				planId,
				priceId: before.basePriceId!,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 35, interval: BillingInterval.Month },
						items: [messagesItem(100)],
					},
				],
			});

			await expectPlanRowsCorrect({
				ctx,
				before,
				expected: {
					mintedBase: { amount: 35 },
					retiredPrices: [before.basePriceId!],
					survivingCusPrices: [before.basePriceId!],
				},
			});
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// Cross-version row refs: v1 ents still referenced by a versionable cus_ent on v2.
test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: bad state — cus_ent on v1, customer on v2 → v1 update retires, cus_ent survives")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_xver_ent");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planId, name: "XVer Ent V1", items: [messagesItem(100)] },
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 2,
						name: "XVer Ent V2",
						items: [messagesItem(150)],
					},
				],
			});

			const v1Before = await snapshotPlanRows({ ctx, planId, version: 1 });
			const v2Before = await snapshotPlanRows({ ctx, planId, version: 2 });
			const oldEnt = v1Before.ents[TestFeature.Messages];

			// cus_product attaches to latest (v2); cus_ent references v1's ent.
			await seedCustomerProductRef({
				ctx,
				planId,
				entitlementId: oldEnt.id,
				internalFeatureId: oldEnt.internalFeatureId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version: 1, items: [messagesItem(200)] }],
			});

			await expectPlanRowsCorrect({
				ctx,
				before: v1Before,
				expected: {
					mintedEnts: [{ featureId: TestFeature.Messages, allowance: 200 }],
					retiredEnts: [oldEnt.id],
					survivingCusEnts: [oldEnt.id],
				},
			});
			await expectPlanRowsCorrect({
				ctx,
				before: v2Before,
				expected: { stableEnts: true, stableFeaturePrices: true },
			});
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// Cross-version row refs: v1 prices still referenced by a versionable cus_price on v2.
test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: bad state — cus_price on v1 base, customer on v2 → v1 price change retires old base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_row_xver_price");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "XVer Price V1",
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 2,
						name: "XVer Price V2",
						price: { amount: 30, interval: BillingInterval.Month },
					},
				],
			});

			const v1Before = await snapshotPlanRows({ ctx, planId, version: 1 });
			const v2Before = await snapshotPlanRows({ ctx, planId, version: 2 });

			await seedCustomerProductRef({
				ctx,
				planId,
				priceId: v1Before.basePriceId!,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 1,
						price: { amount: 25, interval: BillingInterval.Month },
					},
				],
			});

			await expectPlanRowsCorrect({
				ctx,
				before: v1Before,
				expected: {
					mintedBase: { amount: 25 },
					retiredPrices: [v1Before.basePriceId!],
					survivingCusPrices: [v1Before.basePriceId!],
				},
			});
			await expectPlanRowsCorrect({
				ctx,
				before: v2Before,
				expected: { stableBase: true },
			});
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);

// Expired-only customers are not versionable — hard-delete, don't retire.
test.concurrent(
	`${chalk.yellowBright("catalogV2 rows: expired-only customers → rows deleted (not retired)")}`,
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
						items: [messagesItem(100)],
					},
				],
			});
			const before = await snapshotPlanRows({ ctx, planId });
			const oldEnt = before.ents[TestFeature.Messages];

			await seedCustomerProductRef({
				ctx,
				planId,
				status: CusProductStatus.Expired,
				entitlementId: oldEnt.id,
				internalFeatureId: oldEnt.internalFeatureId,
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				plans: [{ plan_id: planId, items: [messagesItem(200)] }],
			});
			const entry = preview.plans.find((p) => p.plan_id === planId);
			expect(entry?.state.has_customers).toBe(false);

			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, items: [messagesItem(200)] }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});

			await expectPlanRowsCorrect({
				ctx,
				before,
				expected: {
					mintedEnts: [{ featureId: TestFeature.Messages, allowance: 200 }],
					deletedEnts: [oldEnt.id],
				},
			});
		} finally {
			await cleanupPlanRefs({ ctx, planId });
		}
	},
);
