/**
 * catalogV2.update — plan upsert error / validation surface.
 *
 * Green today: versioning guards (`new_version`, `all_versions`+explicit version)
 * and Zod item-shape rejections.
 * Red: duplicate entries, version gap, name-required, rename gates.
 */

import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	CouponDurationType,
	CusProductStatus,
	customerProducts,
	customers,
	ErrCode,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	RewardTriggerEvent,
	RewardType,
	rewardPrograms,
	rewards,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
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

const seedCustomerProductRef = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
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
		status: CusProductStatus.Active,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: false,
	});

	return { customerId, internalCustomerId, cusProductId };
};

const seedRewardProgramRef = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const rewardId = uniqueTestId("cv2_rew");
	const internalRewardId = generateId("rew");
	const programId = uniqueTestId("cv2_rp");
	const internalProgramId = generateId("rp");

	await ctx.db.insert(rewards).values({
		internal_id: internalRewardId,
		id: rewardId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: rewardId,
		type: RewardType.PercentageDiscount,
		discount_config: {
			discount_value: 10,
			duration_type: CouponDurationType.OneOff,
			duration_value: 1,
			apply_to_all: false,
			product_ids: [planId],
		},
	});

	await ctx.db.insert(rewardPrograms).values({
		internal_id: internalProgramId,
		id: programId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		internal_reward_id: internalRewardId,
		product_ids: [planId],
		when: RewardTriggerEvent.Checkout,
		max_redemptions: 1,
		unlimited_redemptions: false,
		exclude_trial: false,
	});

	return { rewardId, programId, internalRewardId, internalProgramId };
};

const cleanupRefs = async ({
	ctx,
	planIds,
	rewardId,
	programId,
}: {
	ctx: AutumnContext;
	planIds: string[];
	rewardId?: string;
	programId?: string;
}) => {
	if (programId) {
		await ctx.db.delete(rewardPrograms).where(eq(rewardPrograms.id, programId));
	}
	if (rewardId) {
		await ctx.db.delete(rewards).where(eq(rewards.id, rewardId));
	}

	for (const planId of planIds) {
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
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: new_version + explicit version → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_nv_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Base" }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: 'versioning "new_version" cannot be combined with an explicit version',
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								version: 1,
								name: "Next",
								versioning: "new_version",
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: new_version + migration.draft → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_nv_mig");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Base" }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage:
					'versioning "new_version" cannot be combined with migration.draft',
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								versioning: "new_version",
								name: "Next",
								migration: { draft: true },
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: new_version on missing plan → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_nv_miss");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: 'versioning "new_version" requires an existing plan',
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Ghost",
								versioning: "new_version",
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: all_versions + explicit version → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_av");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Base" }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage:
					'versioning "all_versions" cannot be combined with an explicit version',
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								version: 1,
								versioning: "all_versions",
								name: "Propagate",
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: duplicate (plan_id, version) entries → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_dup");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: planId, name: "A", version: 1 },
							{ plan_id: planId, name: "B", version: 1 },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: two unpinned entries same plan_id → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_unpin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: planId, name: "A" },
							{ plan_id: planId, name: "B" },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: version gap (declare v3 when max is v1) → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_gap");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "V1" }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, version: 3, name: "V3" }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: create without name → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_noname");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: new_plan_id blocked when plan has customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_ren_cus");
		const newPlanId = uniqueTestId("cv2_err_ren_cus_new");
		await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Rename Me" }],
			});
			await seedCustomerProductRef({ ctx, planId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, new_plan_id: newPlanId }],
					}),
			});
		} finally {
			await cleanupRefs({ ctx, planIds: [planId, newPlanId] });
			await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: new_plan_id blocked when reward program references plan")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_ren_rp");
		const newPlanId = uniqueTestId("cv2_err_ren_rp_new");
		await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		let rewardId: string | undefined;
		let programId: string | undefined;
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Reward Linked",
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
			({ rewardId, programId } = await seedRewardProgramRef({ ctx, planId }));

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, new_plan_id: newPlanId }],
					}),
			});
		} finally {
			await cleanupRefs({
				ctx,
				planIds: [planId, newPlanId],
				rewardId,
				programId,
			});
			await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: Zod — amount + tiers both set")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_zod_both");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errMessage: "'amount' and 'tiers' cannot both be defined",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Bad Item",
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 0,
										price: {
											amount: 10,
											tiers: [
												{ to: 100, amount: 5 },
												{ to: TierInfinite, amount: 2 },
											],
											interval: BillingInterval.Month,
											billing_method: BillingMethod.Prepaid,
											billing_units: 1,
										},
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: Zod — volume flat_amount on graduated")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_zod_flat");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errMessage:
					"flat_amount on tiers is only supported for volume-based pricing",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Bad Flat",
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 0,
										price: {
											tiers: [
												{ to: 100, amount: 5, flat_amount: 10 },
												{ to: TierInfinite, amount: 2 },
											],
											tier_behavior: TierBehavior.Graduated,
											interval: BillingInterval.Month,
											billing_method: BillingMethod.Prepaid,
											billing_units: 1,
										},
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: Zod — tiers[0].to <= included")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_zod_to");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errMessage: "tiers[0].to must be greater than included",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Bad Boundary",
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 100,
										price: {
											tiers: [
												{ to: 50, amount: 1 },
												{ to: TierInfinite, amount: 0.5 },
											],
											interval: BillingInterval.Month,
											billing_method: BillingMethod.UsageBased,
											billing_units: 1,
										},
										reset: { interval: ResetInterval.Month },
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: Zod — proration on usage_based")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_zod_pror");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errMessage: "proration is only supported for prepaid features",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Bad Proration",
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 0,
										price: {
											amount: 1,
											interval: BillingInterval.Month,
											billing_method: BillingMethod.UsageBased,
											billing_units: 1,
										},
										reset: { interval: ResetInterval.Month },
										proration: {
											on_increase: OnIncrease.ProrateImmediately,
											on_decrease: OnDecrease.ProrateImmediately,
										},
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-errors: Zod — reset/price interval mismatch on non-prepaid")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_err_zod_ivl");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errMessage:
					"reset.interval and price.interval can only differ for prepaid prices",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: "Bad Intervals",
								items: [
									{
										feature_id: TestFeature.Messages,
										included: 0,
										price: {
											amount: 1,
											interval: BillingInterval.Month,
											billing_method: BillingMethod.UsageBased,
											billing_units: 1,
										},
										reset: { interval: ResetInterval.Year },
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
