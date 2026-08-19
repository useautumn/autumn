/**
 * catalogV2.update — migratable customize lanes: paid add/remove, price null,
 * trial stripped when items also change.
 *
 * Contract:
 *   adding a priced item → add_items only, no_billing_changes false
 *   removing a priced item → remove_items only, no_billing_changes false
 *   price: null → price lane null + previous_price, no_billing_changes false
 *   trial + items → trial dropped from customize, items remain
 */

import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	deleteMigrations,
	expectMigrationDraftsCorrect,
	expectUpdateMigrations,
} from "./utils/expectMigrationDrafts.js";
import { seedVersionableCustomer } from "./utils/seedVersionableCustomer.js";

const dashboardItem = { feature_id: TestFeature.Dashboard };

const messagesPrepaid = {
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
};

const monthPrice = ({ amount }: { amount: number }) => ({
	amount,
	interval: BillingInterval.Month,
});

const messagesFree = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: adding a paid item → add_items, no_billing_changes false")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_padd");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Add Paid",
						items: [dashboardItem],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [dashboardItem, messagesPrepaid],
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
									add_items: [
										{
											feature_id: TestFeature.Messages,
											included: 0,
											unlimited: false,
											reset: { interval: ResetInterval.Month },
											price: {
												amount: 10,
												interval: BillingInterval.Month,
												billing_method: BillingMethod.Prepaid,
												billing_units: 100,
												max_purchase: null,
											},
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
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: removing a paid item → remove_items, no_billing_changes false")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_prem");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Remove Paid",
						items: [dashboardItem, messagesPrepaid],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [dashboardItem],
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
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											billing_method: BillingMethod.Prepaid,
											interval: BillingInterval.Month,
											interval_count: 1,
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
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: price null + trial+items strips trial from customize")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const dropPrice = uniqueTestId("cv2_mig_pnull");
		const trialItems = uniqueTestId("cv2_mig_trial");
		const planIds = [dropPrice, trialItems];
		await deleteDbPlans({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: dropPrice,
						name: "Drop Price",
						price: monthPrice({ amount: 20 }),
						items: [messagesFree({ included: 100 })],
					},
					{
						plan_id: trialItems,
						name: "Trial Items",
						items: [messagesFree({ included: 100 })],
						free_trial: {
							duration_length: 7,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId: dropPrice, version: 1 });
			await seedVersionableCustomer({ ctx, planId: trialItems, version: 1 });

			const dropped = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: dropPrice,
						price: null,
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response: dropped,
				plans: [[{ plan_id: dropPrice, versions: [1] }]],
			});
			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: dropped.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [dropPrice],
						noBillingChanges: false,
						filter: {
							customer: {
								plan: { plan_id: dropPrice, version: 1, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: dropPrice,
									version: 1,
									custom: false,
								},
								customize: {
									price: null,
									previous_price: monthPrice({ amount: 20 }),
								},
							},
						],
					},
				],
			});

			const mixed = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: trialItems,
						items: [messagesFree({ included: 500 })],
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
						migration: { draft: true },
					},
				],
			});
			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: mixed.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [trialItems],
						noBillingChanges: true,
						filter: {
							customer: {
								plan: { plan_id: trialItems, version: 1, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: trialItems,
									version: 1,
									custom: false,
								},
								customize: {
									remove_items: [
										{
											feature_id: TestFeature.Messages,
											interval: ResetInterval.Month,
											interval_count: 1,
										},
									],
									add_items: [
										{
											feature_id: TestFeature.Messages,
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

			await deleteMigrations({
				ctx,
				ids: [
					dropped.migrations![0]!.id,
					mixed.migrations![0]!.id,
				],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
