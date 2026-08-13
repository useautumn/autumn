/**
 * catalogV2.update — no_billing_changes flag across mixed plans and diffs.
 *
 * Contract:
 *   any billing target poisons the whole draft (one flag per draft)
 *   additional-currency add/remove alone is not a migratable diff → no draft
 *   free-item edit with a paid sibling on the same feature_id currently
 *   counts as a billing change (lossy feature_id lookup)
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
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

const messagesFree = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

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

const monthPrice = ({
	amount,
	additionalCurrencies,
}: {
	amount: number;
	additionalCurrencies?: { currency: string; amount: number }[];
}) => ({
	amount,
	interval: BillingInterval.Month,
	...(additionalCurrencies
		? { additional_currencies: additionalCurrencies }
		: {}),
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: one paid plan poisons no_billing_changes for the whole draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const free = uniqueTestId("cv2_mig_poi_f");
		const paid = uniqueTestId("cv2_mig_poi_p");
		const planIds = [free, paid];
		await deleteDbPlans({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: free,
						name: "Free",
						items: [messagesFree({ included: 100 })],
					},
					{
						plan_id: paid,
						name: "Paid",
						price: monthPrice({ amount: 20 }),
						items: [messagesFree({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId: free, version: 1 });
			await seedVersionableCustomer({ ctx, planId: paid, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: free,
						items: [messagesFree({ included: 500 })],
						migration: { draft: true },
					},
					{
						plan_id: paid,
						price: monthPrice({ amount: 30 }),
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [
					[
						{ plan_id: free, versions: [1] },
						{ plan_id: paid, versions: [1] },
					],
				],
			});

			const [migration] = await migrationRepo.get({
				ctx,
				id: response.migrations![0]!.id,
			});
			expect(migration?.no_billing_changes).toBe(false);
			expect(migration?.operations?.customer).toHaveLength(2);

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: additional-currency add only → no draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_ccy");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Ccy",
						price: monthPrice({ amount: 20 }),
						items: [messagesFree({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: monthPrice({
							amount: 20,
							additionalCurrencies: [{ currency: "eur", amount: 18 }],
						}),
						migration: { draft: true },
					},
				],
			});
			expect(response.migrations ?? []).toHaveLength(0);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: free-item edit with paid sibling on same feature_id is a billing change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_sib");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Sibling",
						items: [messagesFree({ included: 100 }), messagesPrepaid],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesFree({ included: 500 }), messagesPrepaid],
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

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
