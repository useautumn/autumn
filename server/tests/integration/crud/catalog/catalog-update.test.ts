/**
 * TDD test for the catalog batch endpoints.
 *
 * Contract under test:
 *   POST /v1/catalog.preview_update (read-only, NO persist):
 *     - plans[]: PlanUpdatePreview with the proposed ApiPlanV1 under `plan`
 *     - does NOT persist (plans.get still returns the original plan)
 *   POST /v1/catalog.update:
 *     - creates a new plan when plan_id does not exist
 *     - returns { plans: ApiPlanV1[], features, migrations }
 *
 * Pre-impl red: routes/handlers do not exist (404 / undefined fields).
 * Post-impl green: catalog handlers resolve params into the shared plan preview
 *   shape and upsert via create/updateProduct.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogPreview } from "./utils/expectCatalogPreview.js";

test.concurrent(
	`${chalk.yellowBright("catalog: preview_update resolves shared plan preview without persisting")}`,
	async () => {
		const customerId = "catalog-preview-customer";
		const prod = products.pro({
			id: "catalog_preview_pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [prod] }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		const compactPreview = await autumnV2_2.post("/catalog.preview_update", {
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
		expectCatalogPreview({
			preview: compactPreview,
			planChanges: [
				{
					planId: prod.id,
					hasCustomers: true,
					willVersion: true,
					planExpanded: false,
				},
			],
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			expand: ["plan_changes.plan"],
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

		expectCatalogPreview({
			preview,
			planChanges: [
				{
					planId: prod.id,
					hasCustomers: true,
					willVersion: true,
					planExpanded: true,
					items: [{ featureId: TestFeature.Messages, included: 500 }],
				},
			],
		});

		// ── Contract 3: NOT persisted — original plan unchanged ──
		const original = await autumnV2_2.post("/plans.get", { plan_id: prod.id });
		const originalMessages = original.items.find(
			(item: { feature_id: string }) => item.feature_id === "messages",
		);
		expect(originalMessages?.included).toBe(100);
	},
);

test(
	`${chalk.yellowBright("catalog: update honors force_version like plans.update")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const planId = `catalog_force_version_${suffix}`;
		const prod = products.pro({
			id: planId,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-force-version-${suffix}`,
			setup: [s.products({ list: [prod], prefix: "" })],
			actions: [],
		});

		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: planId,
					name: prod.name,
					force_version: true,
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		const got = await autumnV2_2.post("/plans.get", { plan_id: planId });
		expect(got.version).toBe(2);
		const item = got.items.find(
			(entry: { feature_id: string }) =>
				entry.feature_id === TestFeature.Messages,
		);
		expect(item?.included).toBe(500);
	},
);

test(
	`${chalk.yellowBright("catalog: update propagates plan updates to selected variants")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const planId = `catalog_propagate_${suffix}`;
		const variantId = `${planId}_annual`;
		const prod = products.pro({
			id: planId,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId: `catalog-propagate-${suffix}`,
			setup: [s.products({ list: [prod], prefix: "" })],
			actions: [],
		});

		await autumnV2_3.plans.createVariant({
			base_plan_id: planId,
			variant_plan_id: variantId,
			name: "Annual",
		});

		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: planId,
					name: prod.name,
					propagate_to_variants: [variantId],
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		const variant = await autumnV2_2.post("/plans.get", {
			plan_id: variantId,
		});
		const item = variant.items.find(
			(entry: { feature_id: string }) =>
				entry.feature_id === TestFeature.Messages,
		);
		expect(item?.included).toBe(500);
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

test.concurrent(
	`${chalk.yellowBright("catalog: update creates a plan referencing a feature created in the same call")}`,
	async () => {
		// Regression: the plan 404'd ("feature not found") because plan creation
		// resolved features against the request-start snapshot, which did not
		// include the feature created earlier in the same batch.
		const customerId = "catalog-update-feature-plan";
		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const featureId = "catalog_update_batch_feature";
		const planId = "catalog_update_batch_plan";
		const res = await autumnV2_2.post("/catalog.update", {
			features: [
				{
					feature_id: featureId,
					name: "Credits",
					type: "metered",
					consumable: true,
				},
			],
			plans: [
				{
					plan_id: planId,
					name: "Pro",
					price: { amount: 20, interval: "month" },
					items: [
						{
							feature_id: featureId,
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		// ── Contract: feature persisted ──
		expect(
			res.features.find((feature: { id: string }) => feature.id === featureId),
		).toBeDefined();

		// ── Contract: plan persisted with the new feature as an item ──
		const plan = await autumnV2_2.post("/plans.get", { plan_id: planId });
		expect(plan.id).toBe(planId);
		const item = plan.items.find(
			(entry: { feature_id: string }) => entry.feature_id === featureId,
		);
		expect(item?.included).toBe(100);
	},
);
