import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { runUpdatePlanMigration } from "../../../utils/runUpdatePlanMigration";
import { lifetimeCredits } from "./updateIntervalTestUtils";

test.concurrent(`${chalk.yellowBright("migrations update_items interval: monthly credits become one-off with and without usage")}`, async () => {
	for (const scenario of [
		{
			customerId: "migration-update-items-interval-usage",
			usage: 40,
			remaining: 110,
		},
		{
			customerId: "migration-update-items-interval-no-usage",
			usage: 0,
			remaining: 150,
		},
	]) {
		const base = products.base({
			id: `${scenario.customerId}-plan`,
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: scenario.customerId,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [
				s.billing.attach({ productId: base.id }),
				...(scenario.usage > 0
					? [
							s.track({
								featureId: TestFeature.Credits,
								value: scenario.usage,
								timeout: 2000,
							}),
						]
					: []),
			],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${scenario.customerId}-mig`,
			customerId: scenario.customerId,
			filter: { customer: { plan: { plan_id: base.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: base.id },
						customize: {
							update_items: [
								{
									filter: { feature_id: TestFeature.Credits },
									included: 150,
									interval: ResetInterval.OneOff,
								},
							],
						},
					},
				],
			},
			runOnServer: false,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(
			scenario.customerId,
		);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Credits,
			remaining: scenario.remaining,
			usage: scenario.usage,
			nextResetAt: null,
			planId: base.id,
			breakdown: {
				[ResetInterval.OneOff]: {
					included_grant: 150,
					remaining: scenario.remaining,
					usage: scenario.usage,
				},
			},
		});
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(
				scenario.customerId,
			),
			count: 0,
		});
	}
});

test.concurrent(`${chalk.yellowBright("migrations update_items interval: mixed included and interval update carries usage")}`, async () => {
	const customerId = "migration-update-items-mixed-included-interval";
	const base = products.base({
		id: "migration-update-items-mixed-included-interval-plan",
		items: [items.monthlyCredits({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Credits, value: 45, timeout: 2000 }),
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
								filter: { feature_id: TestFeature.Credits },
								included: 180,
								interval: ResetInterval.OneOff,
							},
						],
					},
				},
			],
		},
		runOnServer: false,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 135,
		usage: 45,
		nextResetAt: null,
		planId: base.id,
		breakdown: {
			[ResetInterval.OneOff]: {
				included_grant: 180,
				remaining: 135,
				usage: 45,
			},
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items interval: free one-off to monthly preserves plan anchor")}`, async () => {
	const customerId = "migration-update-items-one-off-to-month-free";
	const base = products.base({
		id: "migration-update-items-one-off-to-month-free-plan",
		items: [lifetimeCredits({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Credits, value: 40, timeout: 2000 }),
		],
	});
	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const startedAt =
		before.subscriptions.find((subscription) => subscription.plan_id === base.id)
			?.started_at ??
		before.purchases.find((purchase) => purchase.plan_id === base.id)
			?.started_at;
	expect(startedAt).toBeDefined();

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
								filter: { feature_id: TestFeature.Credits },
								included: 150,
								interval: ResetInterval.Month,
							},
						],
					},
				},
			],
		},
		runOnServer: false,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 110,
		usage: 40,
		nextResetAt: addMonths(startedAt!, 1).getTime(),
		planId: base.id,
		breakdown: {
			[ResetInterval.Month]: {
				included_grant: 150,
				remaining: 110,
				usage: 40,
			},
		},
	});
});
