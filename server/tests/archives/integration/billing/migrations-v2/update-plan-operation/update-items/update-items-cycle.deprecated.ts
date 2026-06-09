/**
 * TDD coverage for update_items lifecycle behaviors:
 * - Cycle anchor preservation across a mid-cycle update (test-clock advance).
 * - Newly-tracked usage applies to the updated entitlement.
 * - Idempotency: running the same update_items twice is a no-op on the
 *   second pass.
 *
 * Contract under test:
 *   New behaviors:
 *     - Mid-cycle update_items does NOT shift the billing/reset anchor; at
 *       next reset the balance resets to the NEW included value (not the
 *       old one).
 *     - The new entitlement participates in normal track/deduct flows.
 *     - Running an identical update_items migration twice yields the same
 *       end state as running it once.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test(`${chalk.yellowBright("migrations update_items: cycle anchor survives mid-cycle update; next reset uses new included")}`, async () => {
	const customerId = "migration-update-items-cycle-anchor";
	const pro = products.pro({
		id: "migration-update-items-cycle-anchor-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 10 }),
		],
	});

	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const anchorBefore = before.balances[TestFeature.Messages]
		?.next_reset_at as number;
	expect(anchorBefore, "monthly entitlement must have a next_reset_at").not.toBeNull();

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
							{ filter: { feature_id: TestFeature.Messages }, included: 300 },
						],
					},
				},
			],
		},
	});

	const afterUpdate = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterUpdate,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		nextResetAt: anchorBefore,
		planId: pro.id,
	});

	// Advance past the original anchor — the entitlement should reset to the
	// NEW included value (300), not the old (100).
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 30,
		waitForSeconds: 30,
	});

	const afterReset = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterReset,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		planId: pro.id,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: tracking new usage on the updated entitlement deducts correctly")}`, async () => {
	const customerId = "migration-update-items-track-after-update";
	const base = products.base({
		id: "migration-update-items-track-after-update-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
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
							{ filter: { feature_id: TestFeature.Messages }, included: 250 },
						],
					},
				},
			],
		},
	});

	// Track 75 against the (now patched) entitlement.
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 75,
		},
		{ timeout: 2000 },
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 175,
		usage: 75,
		planId: base.id,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: running the same migration twice is idempotent")}`, async () => {
	const customerId = "migration-update-items-idempotent";
	const base = products.base({
		id: "migration-update-items-idempotent-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 40, timeout: 2000 }),
		],
	});

	const runMigration = (migrationSuffix: string) =>
		runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig-${migrationSuffix}`,
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
									filter: { feature_id: TestFeature.Messages },
									included: 250,
								},
							],
						},
					},
				],
			},
		});

	await runMigration("first");

	const afterFirst = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterFirst,
		featureId: TestFeature.Messages,
		remaining: 210,
		usage: 40,
		planId: base.id,
	});

	await runMigration("second");

	const afterSecond = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterSecond,
		featureId: TestFeature.Messages,
		remaining: 210,
		usage: 40,
		planId: base.id,
	});
});
