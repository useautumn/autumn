/**
 * Integration tests for $none filter quantifier with add_plan.
 *
 * Contract under test:
 *   - $none with empty filter matches customers with no active plans.
 *   - $none with plan_id matches customers who don't have that specific plan.
 *   - Combining $none filter + add_plan attaches a plan to customers who lack it.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runMigrationAndWait } from "../utils/runMigrationPreview";

test(`${chalk.yellowBright("$none filter: add_plan to customers without a specific plan")}`, async () => {
	const suffix = Date.now();
	const customerId = `none-filter-add-${suffix}`;
	const planA = products.base({
		id: `none-plan-a-${suffix}`,
		items: [items.dashboard()],
	});
	const planB = products.base({
		id: `none-plan-b-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [planA, planB] })],
		actions: [s.billing.attach({ productId: planA.id })],
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: {
			customer: {
				plan: { $none: { plan_id: planB.id } },
			},
		},
		operations: {
			customer: [{ type: "add_plan", plan_id: planB.id }],
		},
	});

	expect(result.status).toBe("succeeded");
	const preview = result.response.preview as Record<string, unknown>;
	const planChanges = preview.plan_changes as unknown[];
	expect(planChanges.length).toBe(1);
});

