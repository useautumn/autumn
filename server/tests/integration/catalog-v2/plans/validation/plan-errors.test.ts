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
	ErrCode,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	TierBehavior,
	TierInfinite,
	VercelMarketplaceMode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { cleanupRefs, seedCustomerProductRef } from "../utils/seedPlanRefs.js";

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
								versioning: "new_version", active: true,
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
								versioning: "new_version", active: true,
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
								versioning: "new_version", active: true,
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
	`${chalk.yellowBright("catalogV2 plan-errors: new_plan_id blocked only for plans with Vercel installs")}`,
	async () => {
		// Sub-org: the gate reads org.processor_configs, which we mutate here.
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.platform.create({})],
			actions: [],
		});
		const vercelPlanId = uniqueTestId("cv2_err_ren_vercel");
		const vercelNewPlanId = uniqueTestId("cv2_err_ren_vercel_new");
		const freePlanId = uniqueTestId("cv2_err_ren_novercel");
		const freeNewPlanId = uniqueTestId("cv2_err_ren_novercel_new");
		const allPlanIds = [
			vercelPlanId,
			vercelNewPlanId,
			freePlanId,
			freeNewPlanId,
		];
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: vercelPlanId, name: "Vercel Locked" },
					{ plan_id: freePlanId, name: "No Installs" },
				],
			});
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					processor_configs: {
						...ctx.org.processor_configs,
						vercel: {
							client_integration_id: "test_integration",
							client_secret: "test_secret",
							webhook_url: "https://example.com/webhook",
							marketplace_mode: VercelMarketplaceMode.Installation,
						},
					},
				},
			});
			await seedCustomerProductRef({
				ctx,
				planId: vercelPlanId,
				vercelInstall: true,
			});
			await seedCustomerProductRef({ ctx, planId: freePlanId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage:
					"Cannot change product ID while Vercel customers are subscribed",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: vercelPlanId, new_plan_id: vercelNewPlanId }],
					}),
			});

			// Non-Vercel customers don't trip the gate, even on a Vercel org.
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: freePlanId, new_plan_id: freeNewPlanId }],
			});
		} finally {
			await cleanupRefs({ ctx, planIds: allPlanIds });
			await deleteDbPlans({ ctx, planIds: allPlanIds });
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
