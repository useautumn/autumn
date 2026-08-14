/**
 * Same-item remove+add (production draft shape: interval + interval_count)
 * must update the grant, carry usage, and leave sibling intervals alone.
 *
 * Red (current):  grant resets / usage drops / sibling bucket is rewritten
 * Green (after):  remaining = newGrant - carriedUsage; other intervals unchanged
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

const replaceSameItem = ({
	planId,
	interval,
	included,
}: {
	planId: string;
	interval: ResetInterval;
	included: number;
}) => ({
	type: "update_plan" as const,
	plan_filter: { plan_id: planId },
	customize: {
		remove_items: [
			{
				feature_id: TestFeature.Messages,
				interval,
				interval_count: 1,
			},
		],
		add_items: [
			{
				feature_id: TestFeature.Messages,
				included,
				reset: { interval },
			},
		],
	},
});

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: replace lifetime item carries usage")}`,
	async () => {
		const customerId = "mig-same-item-lifetime";
		const free = products.base({
			id: "mig-same-item-lifetime-plan",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [free] })],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.track({ featureId: TestFeature.Messages, value: 40, timeout: 2000 }),
			],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: free.id } } },
			operations: {
				customer: [
					replaceSameItem({
						planId: free.id,
						interval: ResetInterval.OneOff,
						included: 250,
					}),
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 250,
			remaining: 210,
			usage: 40,
			nextResetAt: null,
			planId: free.id,
			breakdown: {
				[ResetInterval.OneOff]: {
					included_grant: 250,
					remaining: 210,
					usage: 40,
				},
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: replace monthly item carries usage and reset")}`,
	async () => {
		const customerId = "mig-same-item-monthly";
		const free = products.base({
			id: "mig-same-item-monthly-plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [free] })],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
			],
		});

		const before = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const nextResetAt = before.balances[TestFeature.Messages]?.next_reset_at;
		expect(nextResetAt).not.toBeNull();

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: free.id } } },
			operations: {
				customer: [
					replaceSameItem({
						planId: free.id,
						interval: ResetInterval.Month,
						included: 200,
					}),
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 170,
			usage: 30,
			nextResetAt: nextResetAt!,
			planId: free.id,
			breakdown: {
				[ResetInterval.Month]: {
					included_grant: 200,
					remaining: 170,
					usage: 30,
				},
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: replace lifetime leaves monthly sibling usage")}`,
	async () => {
		const customerId = "mig-same-item-lifetime-sibling";
		const free = products.base({
			id: "mig-same-item-lifetime-sibling-plan",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.lifetimeMessages({ includedUsage: 500 }),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});

		await autumnV2_3.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
			interval: ResetInterval.Month,
		});
		await autumnV2_3.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 400,
			interval: ResetInterval.OneOff,
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: free.id } } },
			operations: {
				customer: [
					replaceSameItem({
						planId: free.id,
						interval: ResetInterval.OneOff,
						included: 800,
					}),
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 900,
			remaining: 750,
			usage: 150,
			planId: free.id,
			breakdownCount: 2,
			breakdown: {
				[ResetInterval.Month]: {
					included_grant: 100,
					remaining: 50,
					usage: 50,
				},
				[ResetInterval.OneOff]: {
					included_grant: 800,
					remaining: 700,
					usage: 100,
				},
			},
		});
	},
);
