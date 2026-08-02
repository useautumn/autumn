/**
 * TDD coverage: batch add_items must anchor reset cycles to the TRIAL END for
 * trialing customers — the per-customer lane forces the billing anchor to
 * trial_ends_at while trialing.
 *
 * Contract under test:
 *   New behaviors:
 *     - pro with a 7-day trial + migrated `100 messages / month` → the new
 *       balance's next_reset_at is ~now + 7 days (the trial end), NOT
 *       now + 1 month.
 *   Side effects:
 *     - the run stays on the batch lane; the item run lands succeeded.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";

const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

test.concurrent(`${chalk.yellowBright("batch migration: add_items on a trialing plan anchors resets to the trial end")}`, async () => {
	const customerId = "batch-trial-anchor";
	const pro = products.proWithTrial({
		id: "batch-trial-anchor-pro",
		// Base price only — no sibling resetting entitlement, so the anchor must
		// come from the billing-anchor rungs, not sibling inheritance.
		items: [],
		trialDays: TRIAL_DAYS,
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const attachedAt = Date.now();

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-trial-anchor-mig",
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						add_items: [
							itemsV2.monthlyMessages({ included: 100 }),
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});
	expect(result?.lane).toBe("batch");

	// The migrated balance resets at the trial end — not a month from now.
	expectBalanceCorrect({
		customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: attachedAt + TRIAL_DAYS * DAY_MS,
	});
});
