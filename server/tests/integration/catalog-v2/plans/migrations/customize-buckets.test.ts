/**
 * catalogV2.update — customize bucketing: shared ops, match-key changes,
 * combined price+item diffs, feature rename in the same call.
 *
 * Contract:
 *   two plans with identical item diffs → one op whose plan_filter is $or
 *   interval change → remove old key + add new key
 *   price + items in one update → one customize with both lanes
 *   feature rename + included bump → remove old feature_id, add new
 */

import { test } from "bun:test";
import {
	BillingInterval,
	FeatureType,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbFeatures } from "../../utils/expectCatalogFeatures.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	deleteMigrations,
	expectMigrationDraftsCorrect,
	expectUpdateMigrations,
} from "./utils/expectMigrationDrafts.js";
import { seedVersionableCustomer } from "./utils/seedVersionableCustomer.js";

const messagesItem = ({
	included,
	interval = ResetInterval.Month,
}: {
	included: number;
	interval?: ResetInterval;
}) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval },
});

const messagesCustomize = ({
	included,
	fromInterval = ResetInterval.Month,
	toInterval = ResetInterval.Month,
}: {
	included: number;
	fromInterval?: ResetInterval;
	toInterval?: ResetInterval;
}) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: fromInterval,
			interval_count: 1,
		},
	],
	add_items: [
		{
			feature_id: TestFeature.Messages,
			included,
			unlimited: false,
			reset: { interval: toInterval },
		},
	],
});

const monthPrice = ({ amount }: { amount: number }) => ({
	amount,
	interval: BillingInterval.Month,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: two plans with the same item diff share one $or op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const left = uniqueTestId("cv2_mig_shr_a");
		const right = uniqueTestId("cv2_mig_shr_b");
		const planIds = [left, right];
		await deleteDbPlans({ ctx, planIds });
		try {
			for (const planId of planIds) {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: planId,
							items: [messagesItem({ included: 100 })],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId, version: 1 });
			}

			const response = await autumnV2_3.catalogV2.update({
				plans: planIds.map((planId) => ({
					plan_id: planId,
					items: [messagesItem({ included: 500 })],
					migration: { draft: true },
				})),
			});
			expectUpdateMigrations({
				response,
				plans: [
					[
						{ plan_id: left, versions: [1] },
						{ plan_id: right, versions: [1] },
					],
				],
			});

			const branches = [left, right]
				.sort((a, b) => a.localeCompare(b))
				.map((planId) => ({ plan_id: planId, version: 1 }));

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [left, right],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { $or: branches, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: { $or: branches, custom: false },
								customize: messagesCustomize({ included: 500 }),
							},
						],
					},
				],
			});

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: interval change is remove old key + add new key")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_intv");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Interval",
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							messagesItem({
								included: 100,
								interval: ResetInterval.Year,
							}),
						],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1] }]],
			});

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [planId],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { plan_id: planId, version: 1, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: planId,
									version: 1,
									custom: false,
								},
								customize: messagesCustomize({
									included: 100,
									fromInterval: ResetInterval.Month,
									toInterval: ResetInterval.Year,
								}),
							},
						],
					},
				],
			});

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: price + items in one update share one op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_both");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Both Lanes",
						price: monthPrice({ amount: 20 }),
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: monthPrice({ amount: 30 }),
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [planId],
						noBillingChanges: false,
						filter: {
							customer: {
								plan: { plan_id: planId, version: 1, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: planId,
									version: 1,
									custom: false,
								},
								customize: {
									price: monthPrice({ amount: 30 }),
									previous_price: monthPrice({ amount: 20 }),
									...messagesCustomize({ included: 500 }),
								},
							},
						],
					},
				],
			});

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// Same-call feature rename: from/to plans use each product's own feature objects.
test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: feature rename + item bump → remove old feature_id, add new")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const fromId = uniqueTestId("cv2_mig_fn_from");
		const toId = uniqueTestId("cv2_mig_fn_to");
		const planId = uniqueTestId("cv2_mig_fn_plan");
		await deleteDbFeatures({ ctx, featureIds: [fromId, toId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: fromId,
						name: "Old Id",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "Uses Feature",
						items: [
							{
								feature_id: fromId,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: fromId,
						name: "Old Id",
						new_feature_id: toId,
						type: FeatureType.Metered,
						consumable: true,
					},
				],
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: toId,
								included: 500,
								reset: { interval: ResetInterval.Month },
							},
						],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1] }]],
			});
			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [planId],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { plan_id: planId, version: 1, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: planId,
									version: 1,
									custom: false,
								},
								customize: {
									remove_items: [
										{
											feature_id: fromId,
											interval: ResetInterval.Month,
											interval_count: 1,
										},
									],
									add_items: [
										{
											feature_id: toId,
											included: 500,
											unlimited: false,
											reset: { interval: ResetInterval.Month },
										},
									],
								},
							},
						],
					},
				],
			});

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [fromId, toId] });
		}
	},
);
