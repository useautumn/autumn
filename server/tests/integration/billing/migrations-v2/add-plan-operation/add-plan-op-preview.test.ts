/**
 * Integration tests for add_plan — preview output.
 *
 * Contract under test:
 *   - add_plan preview emits an "activated" plan_change with the plan_id.
 *   - add_plan with boolean features emits flag_changes.
 *   - add_plan with metered features emits balance_changes.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runMigrationAndWait } from "../utils/runMigrationPreview";

type PreviewPlanChange = {
	action: string;
	plan_id: string;
	item_changes: Array<{ action: string; feature_id: string }>;
};

test(`${chalk.yellowBright("add_plan preview: emits activated plan_change")}`, async () => {
	const suffix = Date.now();
	const customerId = `add-plan-preview-created-${suffix}`;
	const existing = products.base({
		id: `add-prev-existing-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const newPlan = products.base({
		id: `add-prev-new-${suffix}`,
		items: [items.dashboard(), items.monthlyCredits({ includedUsage: 50 })],
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
			customer: [{ type: "add_plan", plan_id: newPlan.id }],
		},
	});

	expect(result.status).toBe("succeeded");
	const preview = result.response.preview as {
		plan_changes: PreviewPlanChange[];
		balance_changes: unknown[];
		flag_changes: unknown[];
	};

	expect(preview.plan_changes.length).toBe(1);
	const planChange = JSON.parse(
		typeof preview.plan_changes[0] === "string"
			? preview.plan_changes[0]
			: JSON.stringify(preview.plan_changes[0]),
	) as PreviewPlanChange;
	expect(planChange.action).toBe("activated");
	expect(planChange.plan_id).toBe(newPlan.id);

	expect(preview.flag_changes.length).toBeGreaterThan(0);
	expect(preview.balance_changes.length).toBeGreaterThan(0);
});
