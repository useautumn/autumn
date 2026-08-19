/**
 * catalogV2.update — pinned versions, omit→latest, multi-entry, mint ladder,
 * all_versions propagation.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	customerProducts,
	customers,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";

const getFull = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const seedCustomerProductRef = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const full = await getFull({ ctx, planId });
	const customerId = uniqueTestId("cv2_ver_cus");
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
	});

	return { cusProductId, internalProductId: full.internal_id };
};

const seedV1AndV2 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "V1",
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
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				version: 2,
				name: "V2",
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
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: pinned v1 edit; latest v2 untouched")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 1,
						name: "V1 Edited",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 150,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1 Edited",
						allowances: { [TestFeature.Messages]: 150 },
					},
					{
						id: planId,
						version: 2,
						name: "V2",
						allowances: { [TestFeature.Messages]: 200 },
					},
				],
			});
			// catalogV2.get is latest-only
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						version: 2,
						name: "V2",
						allowances: { [TestFeature.Messages]: 200 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: omit version targets latest")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_latest");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Latest Edited",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 300,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1",
						allowances: { [TestFeature.Messages]: 100 },
					},
					{
						id: planId,
						version: 2,
						name: "Latest Edited",
						allowances: { [TestFeature.Messages]: 300 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: multi-entry same plan_id (v1 + v2) in one call")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_multi");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 1,
						name: "V1 Multi",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 110,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
					{
						plan_id: planId,
						version: 2,
						name: "V2 Multi",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 220,
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

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1 Multi",
						allowances: { [TestFeature.Messages]: 110 },
					},
					{
						id: planId,
						version: 2,
						name: "V2 Multi",
						allowances: { [TestFeature.Messages]: 220 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: mint ladder v1 update + v2 create")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_mint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Only V1",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 50,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 1,
						name: "V1 Updated",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 60,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
					{
						plan_id: planId,
						version: 2,
						name: "Minted V2",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 90,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			expect(response.results.plans.some((p) => p.action === "create")).toBe(
				true,
			);

			const v2 = await getFull({ ctx, planId, version: 2 });
			expect(v2).toBeTruthy();
			expect(v2.name).toBe("Minted V2");
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1 Updated",
						allowances: { [TestFeature.Messages]: 60 },
					},
					{
						id: planId,
						version: 2,
						name: "Minted V2",
						allowances: { [TestFeature.Messages]: 90 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: all_versions propagates to every existing version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_all");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						name: "Propagated",
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planId, version: 1, name: "Propagated" },
					{ id: planId, version: 2, name: "Propagated" },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: all_versions on brand-new plan → plain create")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_newall");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const preview = await autumnV2_3.catalogV2.previewUpdate({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						name: "Brand New All",
					},
				],
			});
			expectCatalogPreviewCorrect({
				preview,
				plans: [{ planId, action: "create" }],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						name: "Brand New All",
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, version: 1, name: "Brand New All" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// Cross-ref section 14 — free trial × versioning
test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: all_versions propagates free_trial to every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_ft_all");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1",
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 2,
						name: "V2",
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						free_trial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: null,
						},
					},
					{
						id: planId,
						version: 2,
						freeTrial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
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
	`${chalk.yellowBright("catalogV2 versions: new_version mints clone; customers stay on old")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_nv");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1 Name",
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
							card_required: false,
						},
					},
				],
			});

			const v1Before = await getFull({ ctx, planId, version: 1 });
			const { cusProductId } = await seedCustomerProductRef({
				ctx,
				planId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V2 Name",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 200,
								reset: { interval: ResetInterval.Month },
							},
						],
						versioning: "new_version",
					},
				],
			});

			const v1After = await getFull({ ctx, planId, version: 1 });
			const v2 = await getFull({ ctx, planId, version: 2 });
			expect(v1After.internal_id).toBe(v1Before.internal_id);
			expect(v1After.name).toBe("V1 Name");
			expect(v1After.entitlements[0]?.allowance).toBe(100);
			expect(v2.name).toBe("V2 Name");
			expect(v2.entitlements[0]?.allowance).toBe(200);
			expect(v2.free_trial?.length).toBe(7);
			expect(v2.internal_id).not.toBe(v1Before.internal_id);

			const [cusProd] = await ctx.db
				.select()
				.from(customerProducts)
				.where(eq(customerProducts.id, cusProductId))
				.limit(1);
			expect(cusProd?.internal_product_id).toBe(v1Before.internal_id);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 versions: pinned version:1 trial edit leaves latest untouched")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ver_ft_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1",
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 2,
						name: "V2",
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 1,
						free_trial: {
							duration_length: 21,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						freeTrial: {
							duration_length: 21,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
							on_end: null,
						},
					},
					{
						id: planId,
						version: 2,
						freeTrial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
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
