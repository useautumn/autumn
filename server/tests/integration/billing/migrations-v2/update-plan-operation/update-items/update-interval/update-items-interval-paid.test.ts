import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingMethod,
	ResetInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";
import { runUpdatePlanMigration } from "../../../utils/runUpdatePlanMigration";
import { lifetimeCredits } from "./updateIntervalTestUtils";

test.concurrent(`${chalk.yellowBright("migrations update_items interval: subscription one-off to monthly uses subscription cycle")}`, async () => {
	const customerId = "migration-update-items-one-off-to-month-sub";
	const pro = products.pro({
		id: "migration-update-items-one-off-to-month-sub-plan",
		items: [lifetimeCredits({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 10 }),
			s.track({ featureId: TestFeature.Credits, value: 40, timeout: 2000 }),
		],
	});
	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const currentPeriodEnd = before.subscriptions.find(
		(subscription) => subscription.plan_id === pro.id,
	)?.current_period_end;
	expect(currentPeriodEnd).not.toBeNull();

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
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
		noBillingChanges: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 110,
		usage: 40,
		nextResetAt: currentPeriodEnd!,
		planId: pro.id,
		breakdown: {
			[ResetInterval.Month]: {
				included_grant: 150,
				remaining: 110,
				usage: 40,
			},
		},
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items interval: one-off prepaid interval changes are rejected")}`, async () => {
	const customerId = "migration-update-items-one-off-prepaid-rejected";
	const oneOffPrepaid = constructPrepaidItem({
		featureId: TestFeature.Credits,
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
		isOneOff: true,
	});
	const base = products.base({
		id: "migration-update-items-one-off-prepaid-rejected-plan",
		items: [oneOffPrepaid],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [s.billing.attach({ productId: base.id })],
	});

	await expect(
		runUpdatePlanMigration({
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
										feature_id: TestFeature.Credits,
										billing_method: BillingMethod.Prepaid,
									},
									interval: ResetInterval.Month,
								},
							],
						},
					},
				],
			},
			runOnServer: false,
		}),
	).rejects.toThrow(/one-off paid/i);
});
