/**
 * TDD coverage for update_items + rollover.
 *
 * Contract under test:
 *   New behaviors:
 *     - When an entitlement with an active rollover is updated via update_items,
 *       the rollover is carried over onto the new entitlement.
 *     - The updated entitlement keeps the same rollover configuration that
 *       was already in place (no need to redeclare it when only bumping
 *       `included`).
 */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_items: rollover from old cusEnt carries onto new cusEnt")}`, async () => {
	const customerId = "migration-update-items-rollover-carry";
	const base = products.base({
		id: "migration-update-items-rollover-plan",
		items: [
			items.monthlyMessagesWithRollover({
				includedUsage: 400,
				rolloverConfig: {
					max: 500,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			}),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 500 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	// 500 new included + 150 unused that rolled over = 650 available.
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 650,
		usage: 0,
		rollovers: [{ balance: 150 }],
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});
