/**
 * TDD coverage for update_plan item patch migrations.
 *
 * Contract under test:
 *   - update_plan reuses update-subscription patch semantics for add_items,
 *     remove_items, usage carry, and rollover carry.
 *   - Migration execution does not create extra invoices.
 *   - Existing customer products are patched, not replaced or expired.
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import {
	BillingInterval,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_plan: metered rollover carries to added item")}`, async () => {
	const customerId = "migration-update-carry-rollover";
	const base = products.base({
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
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
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
						remove_items: [
							{
								feature_id: TestFeature.Messages,
								interval: BillingInterval.Month,
							},
						],
						add_items: [
							{
								feature_id: TestFeature.Messages,
								included: 500,
								reset: { interval: ResetInterval.Month },
								rollover: {
									max: 500,
									expiry_duration_type: RolloverExpiryDurationType.Month,
									expiry_duration_length: 1,
								},
							},
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [base.id] });
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
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: base.id,
	});
});
