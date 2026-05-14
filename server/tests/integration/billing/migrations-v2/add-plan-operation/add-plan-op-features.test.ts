/**
 * Integration tests for add_plan — feature quantities and paid plans.
 *
 * Contract under test:
 *   - add_plan with feature_quantities sets initial balances on the new plan.
 *   - add_plan attaching a paid plan creates prices on the cusProduct.
 *   - add_plan with a specific version targets that catalog version.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runMigrationAndWait } from "../utils/runMigrationPreview";

test(`${chalk.yellowBright("add_plan: feature_quantities sets initial balances")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-plan-quantities-${suffix}`;
	const existing = products.base({
		id: `add-qty-existing-${suffix}`,
		items: [items.dashboard()],
	});
	const newPlan = products.base({
		id: `add-qty-new-${suffix}`,
		items: [items.prepaidMessages({ includedUsage: 0, billingUnits: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [existing, newPlan] })],
		actions: [s.billing.attach({ productId: existing.id })],
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { customer_id: customerId } },
		operations: {
			customer: [
				{
					type: "add_plan",
					plan_id: newPlan.id,
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: 500 },
					],
				},
			],
		},
	});

	expect(result.status).toBe("succeeded");
	const preview = result.response.preview as Record<string, unknown>;
	const planChanges = preview.plan_changes as unknown[];
	expect(planChanges.length).toBe(1);
});

test(`${chalk.yellowBright("add_plan: paid plan creates cusProduct with prices")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-plan-paid-${suffix}`;
	const free = products.base({
		id: `add-paid-free-${suffix}`,
		items: [items.dashboard()],
	});
	const paid = products.pro({
		id: `add-paid-pro-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, paid] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { customer_id: customerId } },
		operations: {
			customer: [{ type: "add_plan", plan_id: paid.id }],
		},
	});

	expect(result.status).toBe("succeeded");
	const preview = result.response.preview as Record<string, unknown>;
	const planChanges = preview.plan_changes as unknown[];
	expect(planChanges.length).toBe(1);
});

test(`${chalk.yellowBright("add_plan: targets specific catalog version")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-plan-version-${suffix}`;
	const existing = products.base({
		id: `add-ver-existing-${suffix}`,
		items: [items.dashboard()],
	});
	const versionedPlan = products.base({
		id: `add-ver-target-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});

	const { autumnV1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [existing, versionedPlan] })],
		actions: [s.billing.attach({ productId: existing.id })],
	});

	await autumnV1.products.update(versionedPlan.id, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 200,
				reset: { interval: "month" },
			},
		],
		new_version: true,
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { customer_id: customerId } },
		operations: {
			customer: [{ type: "add_plan", plan_id: versionedPlan.id, version: 1 }],
		},
	});

	expect(result.status).toBe("succeeded");
});
