/**
 * Integration tests for the add_plan migration operation — basic cases.
 *
 * Contract under test:
 *   - add_plan attaches a new plan to a customer who doesn't have it.
 *   - add_plan is idempotent: skipped if the customer already has the plan active.
 *   - add_plan runs before update_plan so a later update_plan can target the new plan.
 *   - add_plan with a non-existent plan_id fails the item.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runMigrationAndWait } from "../utils/runMigrationPreview";

test(`${chalk.yellowBright("add_plan: attaches a new free plan")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-plan-basic-${suffix}`;
	const existing = products.base({
		id: `add-plan-existing-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const newPlan = products.base({
		id: `add-plan-new-${suffix}`,
		items: [items.dashboard()],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [existing, newPlan] })],
		actions: [s.billing.attach({ productId: existing.id })],
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: existing.id } } },
		operations: {
			customer: [{ type: "add_plan", plan_id: newPlan.id }],
		},
	});

	expect(result.status).toBe("succeeded");
	const preview = result.response.preview as Record<string, unknown>;
	const planChanges = preview.plan_changes as unknown[];
	expect(planChanges.length).toBe(1);
});

test(`${chalk.yellowBright("add_plan: idempotent — skipped if customer already has plan")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-plan-idem-${suffix}`;
	const plan = products.base({
		id: `add-plan-idem-plan-${suffix}`,
		items: [items.dashboard()],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { customer_id: customerId } },
		operations: {
			customer: [{ type: "add_plan", plan_id: plan.id }],
		},
	});

	expect(result.status).toBe("skipped");
});

test(`${chalk.yellowBright("add_plan: runs before update_plan (ordering)")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-then-update-${suffix}`;
	const existing = products.base({
		id: `add-upd-existing-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const newPlan = products.base({
		id: `add-upd-new-${suffix}`,
		items: [items.dashboard()],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [existing, newPlan] })],
		actions: [s.billing.attach({ productId: existing.id })],
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: existing.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: newPlan.id },
					customize: {
						add_items: [{ feature_id: TestFeature.AdminRights }],
					},
				},
				{ type: "add_plan", plan_id: newPlan.id },
			],
		},
	});

	expect(result.status).toBe("succeeded");
	const preview = result.response.preview as Record<string, unknown>;
	const planChanges = preview.plan_changes as unknown[];
	expect(planChanges.length).toBe(2);
});

test(`${chalk.yellowBright("add_plan: non-existent plan_id fails")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-plan-missing-${suffix}`;
	const existing = products.base({
		id: `add-plan-miss-${suffix}`,
		items: [items.dashboard()],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [existing] })],
		actions: [s.billing.attach({ productId: existing.id })],
	});

	const result = await runMigrationAndWait({
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { customer_id: customerId } },
		operations: {
			customer: [{ type: "add_plan", plan_id: "nonexistent-plan-id" }],
		},
	});

	expect(result.status).toBe("failed");
	const error = result.response.error as { message: string } | undefined;
	expect(error?.message).toContain("not found");
});
