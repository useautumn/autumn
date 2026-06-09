import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	BillingInterval,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_items: interval filter only touches monthly cusEnt; lifetime untouched")}`, async () => {
	const customerId = "migration-update-items-multi-monthly-only";
	const base = products.base({
		id: "migration-update-items-multi-monthly-only-plan",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.lifetimeMessages({ includedUsage: 50 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
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
							{
								filter: {
									feature_id: TestFeature.Messages,
									interval: BillingInterval.Month,
								},
								included: 300,
							},
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [base.id] });

	// Aggregated balance: monthly (300 - 30 usage) + lifetime untouched (50)
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 320,
		usage: 30,
		planId: base.id,
		breakdown: {
			[ResetInterval.Month]: { included_grant: 300, remaining: 270, usage: 30 },
			[ResetInterval.OneOff]: { included_grant: 50, remaining: 50, usage: 0 },
		},
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: feature-id-only filter updates every cusEnt for that feature")}`, async () => {
	const customerId = "migration-update-items-multi-feature-wide";
	const base = products.base({
		id: "migration-update-items-multi-feature-wide-plan",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.lifetimeMessages({ includedUsage: 50 }),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [s.billing.attach({ productId: base.id })],
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
							{ filter: { feature_id: TestFeature.Messages }, included: 999 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	// Both monthly and lifetime entitlements should now be granted 999.
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 1998,
		usage: 0,
		planId: base.id,
		breakdown: {
			[ResetInterval.Month]: { included_grant: 999, remaining: 999 },
			[ResetInterval.OneOff]: { included_grant: 999, remaining: 999 },
		},
	});
});
