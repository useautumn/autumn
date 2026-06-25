/**
 * TDD test for the catalog batch endpoints.
 *
 * Contract under test:
 *   POST /v1/catalog.preview_update (read-only, NO persist):
 *     - plans[].plan: ApiPlanV1 (proposed plan resolved, items reflect the change)
 *     - plans[].will_version: boolean (true when a plan with customers changes)
 *     - plans[].has_customers: boolean
 *     - plans[].migration_draft: { id, filter, operations, no_billing_changes } | null
 *     - does NOT persist (plans.get still returns the original plan)
 *   POST /v1/catalog.update:
 *     - creates a new plan when plan_id does not exist
 *     - returns { plans: ApiPlanV1[], features, migrations }
 *
 * Pre-impl red: routes/handlers do not exist (404 / undefined fields).
 * Post-impl green: catalog handlers resolve params via productV2ToApiPlanV1 +
 *   has_customers impact + buildMigrationDraft, and upsert via create/updateProduct.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("catalog: preview_update resolves impact + migration draft without persisting")}`,
	async () => {
		const customerId = "catalog-preview-customer";
		const prod = products.pro({
			id: "catalog_preview_pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
			actions: [s.attach({ productId: prod.id })],
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			plans: [
				{
					plan_id: prod.id,
					name: prod.name,
					items: [
						{
							feature_id: "messages",
							included: 500,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		// ── Contract 1: resolved ApiPlan reflects the proposed change ──
		expect(preview.plans).toHaveLength(1);
		const result = preview.plans[0];
		expect(result.plan.id).toBe(prod.id);
		const messagesItem = result.plan.items.find(
			(item: { feature_id: string }) => item.feature_id === "messages",
		);
		expect(messagesItem?.included).toBe(500);

		// ── Contract 2: versioning impact ──
		expect(result.will_version).toBe(true);
		expect(result.has_customers).toBe(true);

		// ── Contract 3: migration draft present (created from the diff) ──
		expect(result.migration_draft).not.toBeNull();
		expect(typeof result.migration_draft.id).toBe("string");
		expect(result.migration_draft.operations.customer.length).toBeGreaterThan(
			0,
		);

		// ── Contract 4: NOT persisted — original plan unchanged ──
		const original = await autumnV2_2.post("/plans.get", { plan_id: prod.id });
		const originalMessages = original.items.find(
			(item: { feature_id: string }) => item.feature_id === "messages",
		);
		expect(originalMessages?.included).toBe(100);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog: update creates a new plan in one call")}`,
	async () => {
		const customerId = "catalog-update-customer";
		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const newPlanId = "catalog_created_plan";
		const res = await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: newPlanId,
					name: "Catalog Created",
					price: { amount: 10, interval: "month" },
				},
			],
		});

		// ── Contract: response carries the created plan ──
		expect(
			res.plans.find((plan: { id: string }) => plan.id === newPlanId),
		).toBeDefined();

		// ── Contract: plan is persisted ──
		const got = await autumnV2_2.post("/plans.get", { plan_id: newPlanId });
		expect(got.id).toBe(newPlanId);
		expect(got.price?.amount).toBe(10);
	},
);
