/**
 * Upsolve: bumping a one-off included grant (100 → 2000) via remove+add.
 * The auto-draft filter uses reset interval `one_off`; the entitlement is stored as `lifetime`.
 *
 * Red (current):  "two items for the same feature" / customer stays at 100
 * Green (after):  grant becomes 2000 and usage carries
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: replace one-off included grant keeps usage")}`,
	async () => {
		const customerId = "mig-replace-oneoff-included";
		const free = products.base({
			id: "mig-replace-oneoff-free",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [free] })],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.track({ featureId: TestFeature.Messages, value: 20, timeout: 2000 }),
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
					{
						type: "update_plan",
						plan_filter: { plan_id: free.id },
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: ResetInterval.OneOff,
									interval_count: 1,
								},
							],
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: 2000,
									reset: { interval: ResetInterval.OneOff },
								},
							],
						},
					},
				],
			},
			runOnServer: false,
			noBillingChanges: true,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 2000,
			remaining: 1980,
			usage: 20,
			nextResetAt: null,
			planId: free.id,
			breakdown: {
				[ResetInterval.OneOff]: {
					included_grant: 2000,
					remaining: 1980,
					usage: 20,
				},
			},
		});
	},
);
