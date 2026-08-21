/**
 * Per-customer update_plan honors included on remove_items. The important
 * case is a row that does NOT match the filter and must stay put.
 *
 * Contract:
 *   custom 1k + filter included: 100 → row and grant unchanged
 *   catalog 100 + filter included: 100 → 200, same cusEnt row
 *   paid overage included 50 → 100 migrates; included 200 with filter 50 does not
 *   unmatched 100→200 + leftover boolean/lifetime: 1k spared, leftovers land
 */

import { test } from "bun:test";
import {
	ResetInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { readScopedFeatureRow } from "@tests/integration/billing/migrations-v2/batch-migrations/paidRowTestUtils";
import { expectIncludedFilterOutcomeCorrect } from "@tests/integration/billing/migrations-v2/utils/expectIncludedFilterOutcomeCorrect";
import {
	expectUnmatchedReplaceLeftoversCorrect,
	unmatchedReplaceLeftoverCustomize,
} from "@tests/integration/billing/migrations-v2/utils/expectUnmatchedReplaceLeftoversCorrect";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CATALOG_ALLOWANCE = 100;
const CUSTOM_1K_ALLOWANCE = 1000;
const REPLACEMENT_ALLOWANCE = 200;
const PAID_INCLUDED = 50;
const PAID_CUSTOM = 200;
const PAID_REPLACEMENT = 100;

const includedReplace = ({
	fromIncluded,
	toIncluded,
	paid = false,
}: {
	fromIncluded: number;
	toIncluded: number;
	paid?: boolean;
}) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			included: fromIncluded,
		},
	],
	add_items: [
		paid
			? { ...itemsV2.consumableMessages({ amount: 0.1 }), included: toIncluded }
			: itemsV2.monthlyMessages({ included: toIncluded }),
	],
});

const customizeGrant = ({
	included,
	paid = false,
}: {
	included: number;
	paid?: boolean;
}): UpdateSubscriptionV1ParamsInput["customize"] => ({
	remove_items: [
		{ feature_id: TestFeature.Messages, interval: ResetInterval.Month },
	],
	add_items: [
		paid
			? { ...itemsV2.consumableMessages({ amount: 0.1 }), included }
			: itemsV2.monthlyMessages({ included }),
	],
});

test.concurrent(
	`${chalk.yellowBright("per-customer included filter: 1k custom row is not migrated")}`,
	async () => {
		const customerId = "mig-included-spare-1k";
		const plan = products.base({
			id: "mig-included-spare-1k-plan",
			items: [items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: customizeGrant({ included: CUSTOM_1K_ALLOWANCE }),
		});

		const before = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: includedReplace({
							fromIncluded: CATALOG_ALLOWANCE,
							toIncluded: REPLACEMENT_ALLOWANCE,
						}),
					},
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			active: [plan.id],
		});
		await expectIncludedFilterOutcomeCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			before,
			granted: CUSTOM_1K_ALLOWANCE,
			spared: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("per-customer included filter: catalog 100 migrates to 200")}`,
	async () => {
		const customerId = "mig-included-match-100";
		const plan = products.base({
			id: "mig-included-match-100-plan",
			items: [items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const before = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: includedReplace({
							fromIncluded: CATALOG_ALLOWANCE,
							toIncluded: REPLACEMENT_ALLOWANCE,
						}),
					},
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		await expectIncludedFilterOutcomeCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			before,
			granted: REPLACEMENT_ALLOWANCE,
			spared: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("per-customer included filter: paid overage 50 migrates, 200 does not")}`,
	async () => {
		const matchCustomerId = "mig-included-paid-match";
		const spareCustomerId = "mig-included-paid-spare";
		const plan = products.pro({
			id: "mig-included-paid-plan",
			items: [items.consumableMessages({ includedUsage: PAID_INCLUDED })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId: matchCustomerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.otherCustomers([{ id: spareCustomerId, paymentMethod: "success" }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: spareCustomerId,
						productId: plan.id,
					}),
				),
			],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: spareCustomerId,
			plan_id: plan.id,
			customize: customizeGrant({ included: PAID_CUSTOM, paid: true }),
		});

		const matchBefore = await readScopedFeatureRow({
			ctx,
			customerId: matchCustomerId,
			featureId: TestFeature.Messages,
		});
		const spareBefore = await readScopedFeatureRow({
			ctx,
			customerId: spareCustomerId,
			featureId: TestFeature.Messages,
		});

		const paidOp = {
			type: "update_plan" as const,
			plan_filter: { plan_id: plan.id },
			customize: includedReplace({
				fromIncluded: PAID_INCLUDED,
				toIncluded: PAID_REPLACEMENT,
				paid: true,
			}),
		};

		for (const customerId of [matchCustomerId, spareCustomerId]) {
			await runUpdatePlanMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${customerId}-mig`,
				customerId,
				filter: { customer: { plan: { plan_id: plan.id } } },
				operations: { customer: [paidOp] },
				runOnServer: false,
			});
		}

		await expectIncludedFilterOutcomeCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId: matchCustomerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			before: matchBefore,
			granted: PAID_REPLACEMENT,
			spared: false,
		});
		await expectIncludedFilterOutcomeCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId: spareCustomerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			before: spareBefore,
			granted: PAID_CUSTOM,
			spared: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("per-customer included filter: unmatched 100→200 still adds boolean and lifetime")}`,
	async () => {
		const customerId = "mig-included-leftover-1k";
		const plan = products.base({
			id: "mig-included-leftover-1k-plan",
			items: [items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: customizeGrant({ included: CUSTOM_1K_ALLOWANCE }),
		});

		const beforeMonthly = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: unmatchedReplaceLeftoverCustomize(),
					},
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		await expectUnmatchedReplaceLeftoversCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId,
			planId: plan.id,
			beforeMonthly,
		});
	},
);
