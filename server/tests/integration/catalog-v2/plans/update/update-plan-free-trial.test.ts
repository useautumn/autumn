/**
 * catalogV2.update — free_trial shape round-trip, update lanes, and claim-
 * style row semantics (reuse unchanged; retire+mint on change/remove).
 *
 * Spec (section 14): computeFreeTrialPlan takes FreeTrialParamsV1; comparator
 * includes on_end and normalizes defaults (duration_type month, card_required
 * true, on_end bill ≡ omitted). Retired rows stay with is_custom: true.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	customerProducts,
	customers,
	FreeTrialDuration,
	freeTrials,
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
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

const paidSeed = ({
	planId,
	name = "Trial Plan",
	freeTrial,
}: {
	planId: string;
	name?: string;
	freeTrial?: {
		duration_length: number;
		duration_type?: FreeTrialDuration;
		card_required?: boolean;
		on_end?: "bill" | "revert";
	};
}) => ({
	plan_id: planId,
	name,
	price: { amount: 20, interval: BillingInterval.Month },
	...(freeTrial ? { free_trial: freeTrial } : {}),
});

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

/** All free_trial rows for a product — including retired (is_custom) ones. */
const listFreeTrialRows = async ({
	ctx,
	internalProductId,
}: {
	ctx: AutumnContext;
	internalProductId: string;
}) =>
	ctx.db
		.select()
		.from(freeTrials)
		.where(eq(freeTrials.internal_product_id, internalProductId));

const seedCustomerWithTrialRef = async ({
	ctx,
	planId,
	freeTrialId,
}: {
	ctx: AutumnContext;
	planId: string;
	freeTrialId: string;
}) => {
	const full = await getFull({ ctx, planId });
	const customerId = uniqueTestId("cv2_ft_cus");
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
		status: CusProductStatus.Active,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: false,
		free_trial_id: freeTrialId,
	});

	return { customerId, internalCustomerId, cusProductId };
};

const cleanupCustomerRefs = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const cusProds = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.product_id, planId));
	for (const row of cusProds) {
		await ctx.db
			.delete(customerProducts)
			.where(eq(customerProducts.id, row.id));
		await ctx.db
			.delete(customers)
			.where(eq(customers.internal_id, row.internal_customer_id));
	}
};

// ─── Shape round-trip + update lanes ─────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: create full trial → exact shape")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_full");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: "revert",
						},
					}),
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: "revert",
						},
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: minimal duration_length → defaults resolved")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_min");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: { duration_length: 14 },
					}),
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: null,
						},
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: duration_type + on_end round-trip")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const dayId = uniqueTestId("cv2_ft_day");
		const monthId = uniqueTestId("cv2_ft_mo");
		const yearId = uniqueTestId("cv2_ft_yr");
		await deleteDbPlans({ ctx, planIds: [dayId, monthId, yearId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId: dayId,
						name: "Day",
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: true,
							on_end: "bill",
						},
					}),
					paidSeed({
						planId: monthId,
						name: "Month",
						freeTrial: {
							duration_length: 1,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: "revert",
						},
					}),
					paidSeed({
						planId: yearId,
						name: "Year",
						freeTrial: {
							duration_length: 1,
							duration_type: FreeTrialDuration.Year,
							card_required: false,
						},
					}),
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: dayId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: true,
							on_end: "bill",
						},
					},
					{
						id: monthId,
						freeTrial: {
							duration_length: 1,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: "revert",
						},
					},
					{
						id: yearId,
						freeTrial: {
							duration_length: 1,
							duration_type: FreeTrialDuration.Year,
							card_required: false,
							on_end: null,
						},
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [dayId, monthId, yearId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: add / change each field / remove / omit-preserves")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_lanes");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [paidSeed({ planId })],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, freeTrial: null }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: null,
						},
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: null,
						},
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: false,
						},
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: false,
							on_end: null,
						},
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
						},
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: null,
						},
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: "revert",
						},
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: "revert",
						},
					},
				],
			});

			// Omit free_trial → preserve
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Renamed Trial Plan" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						name: "Renamed Trial Plan",
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: "revert",
						},
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, free_trial: null }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, freeTrial: null }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// Items updates rebuild price/ent rows — a different path than details-only
// renames — so trial carry-over across that rebuild needs its own assertion.
test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: cross-facet patch — items change keeps trial; trial change keeps items/price")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_xpatch");
		await deleteDbPlans({ ctx, planIds: [planId] });
		const trial = {
			duration_length: 7,
			duration_type: FreeTrialDuration.Day,
			card_required: true,
			on_end: null,
		};
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Cross Patch Plan",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
						free_trial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
						},
					},
				],
			});

			// Items + price update, free_trial omitted → trial preserved
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 30, interval: BillingInterval.Month },
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
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						basePrice: { amount: 30, interval: BillingInterval.Month },
						allowances: { [TestFeature.Messages]: 250 },
						freeTrial: trial,
					},
				],
			});

			// Trial-only update → items + base price carried
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
						},
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						basePrice: { amount: 30, interval: BillingInterval.Month },
						featureIds: [TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 250 },
						freeTrial: { ...trial, duration_length: 14 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: identical re-send with explicit defaults → none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_idemp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: { duration_length: 14 },
					}),
				],
			});
			// Require persistence first — otherwise action `none` is a false green.
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: null,
						},
					},
				],
			});
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Trial Plan",
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Month,
							card_required: true,
							on_end: "bill",
						},
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "none" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: trial-only change → action update")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_op");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
						},
					}),
				],
			});
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
						},
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// ─── Row semantics ───────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: unchanged → same free_trial row id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_same");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					}),
				],
			});
			const before = await getFull({ ctx, planId });
			const beforeId = before.free_trial?.id;
			expect(beforeId).toBeTruthy();

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Renamed",
						free_trial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});
			const after = await getFull({ ctx, planId });
			expect(after.free_trial?.id).toBe(beforeId);

			const rows = await listFreeTrialRows({
				ctx,
				internalProductId: before.internal_id,
			});
			expect(rows).toHaveLength(1);
			expect(rows[0]?.is_custom).toBe(false);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: changed → new row id; old is_custom true")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_chg");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
						},
					}),
				],
			});
			const before = await getFull({ ctx, planId });
			const oldId = before.free_trial?.id;
			expect(oldId).toBeTruthy();

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
						},
					},
				],
			});
			const after = await getFull({ ctx, planId });
			expect(after.free_trial?.id).toBeTruthy();
			expect(after.free_trial?.id).not.toBe(oldId);

			const rows = await listFreeTrialRows({
				ctx,
				internalProductId: before.internal_id,
			});
			expect(rows.length).toBeGreaterThanOrEqual(2);
			const retired = rows.find((row) => row.id === oldId);
			expect(retired, "old free_trial row must be retained").toBeDefined();
			expect(retired?.is_custom).toBe(true);
			const active = rows.find((row) => row.id === after.free_trial?.id);
			expect(active?.is_custom).toBe(false);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: removed → old row retained is_custom true")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_rm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
						},
					}),
				],
			});
			const before = await getFull({ ctx, planId });
			const oldId = before.free_trial?.id;
			expect(oldId).toBeTruthy();

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, free_trial: null }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, freeTrial: null }],
			});

			const rows = await listFreeTrialRows({
				ctx,
				internalProductId: before.internal_id,
			});
			expect(rows.length).toBeGreaterThanOrEqual(1);
			const retired = rows.find((row) => row.id === oldId);
			expect(retired).toBeDefined();
			expect(retired?.is_custom).toBe(true);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: on_end-only change → new row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_onend");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: true,
							on_end: "bill",
						},
					}),
				],
			});
			const before = await getFull({ ctx, planId });
			const oldId = before.free_trial?.id;

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: true,
							on_end: "revert",
						},
					},
				],
			});
			const after = await getFull({ ctx, planId });
			expect(after.free_trial?.id).not.toBe(oldId);
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: true,
							on_end: "revert",
						},
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 free-trial: customer keeps old trial row ref after retire")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ft_cus");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					paidSeed({
						planId,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
						},
					}),
				],
			});
			const before = await getFull({ ctx, planId });
			const oldId = before.free_trial?.id;
			expect(oldId, "seed free_trial row required").toBeTruthy();
			if (!oldId) throw new Error("missing free_trial id");
			const { cusProductId } = await seedCustomerWithTrialRef({
				ctx,
				planId,
				freeTrialId: oldId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
						},
					},
				],
			});

			const [cusProd] = await ctx.db
				.select()
				.from(customerProducts)
				.where(eq(customerProducts.id, cusProductId))
				.limit(1);
			expect(cusProd?.free_trial_id).toBe(oldId);

			const rows = await listFreeTrialRows({
				ctx,
				internalProductId: before.internal_id,
			});
			const retired = rows.find((row) => row.id === oldId);
			expect(retired?.is_custom).toBe(true);
		} finally {
			await cleanupCustomerRefs({ ctx, planId });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
