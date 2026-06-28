/**
 * Catalog preview_update edge cases: customer impact, versioning, feature diffing.
 *
 * Contract under test (POST /v1/catalog.preview_update, read-only, NO persist):
 *   A. has_customers — true for a plan with an attached customer, false otherwise.
 *      Resolved independently per plan when several are previewed at once.
 *   B. versionable — only true when the proposed change differs in ITEMS and the
 *      plan has customers. A name-only or id-only change → false. An items change
 *      on a plan WITHOUT customers → false.
 *   C. feature diffing — features[] resolves each proposed feature and surfaces
 *      blockers[] (field/code/message) that would make updateCatalog reject it:
 *        - new feature (does not exist) → resolved, no blockers
 *        - existing feature, non-blockable change (name) → no blockers
 *        - existing feature attached to a customer, type change → attached_to_customer
 *   D. batch upsert — a plan may reference a feature created in the SAME batch;
 *      the preview virtually upserts features before resolving plans (no 404).
 *
 * Nothing here persists, so feature-blocker cases can safely target the shared
 * org's features.
 */

import { test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogPreview } from "./utils/expectCatalogPreview.js";
import { expectFeaturePreviewCorrect } from "./utils/expectFeaturePreviewCorrect.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: "month" as const },
});

test.concurrent(
	`${chalk.yellowBright("catalog preview: has_customers + versionable resolve per plan across a batch")}`,
	async () => {
		const customerId = "catalog-preview-multi";
		const planWithCustomer = products.pro({
			id: "catalog_preview_with_cus",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planNoCustomer = products.pro({
			id: "catalog_preview_no_cus",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [planWithCustomer, planNoCustomer] }),
			],
			actions: [s.attach({ productId: planWithCustomer.id })],
		});

		// Both plans change items (100 -> 500) in a single preview call.
		const preview = await autumnV2_2.post("/catalog.preview_update", {
			expand: ["plan_changes.plan"],
			plans: [
				{ plan_id: planWithCustomer.id, items: [messagesItem(500)] },
				{ plan_id: planNoCustomer.id, items: [messagesItem(500)] },
			],
		});

		expectCatalogPreview({
			preview,
			planChanges: [
				{
					planId: planWithCustomer.id,
					hasCustomers: true,
					willVersion: true,
					items: [{ featureId: TestFeature.Messages, included: 500 }],
				},
				{
					planId: planNoCustomer.id,
					hasCustomers: false,
					willVersion: false,
					items: [{ featureId: TestFeature.Messages, included: 500 }],
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog preview: versionable is false for name/id-only changes, true for item changes")}`,
	async () => {
		const customerId = "catalog-preview-willversion";
		const plan = products.pro({
			id: "catalog_preview_wv",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.attach({ productId: plan.id })],
		});

		// ── B: rename only (items unchanged) → has customers but no version ──
		const nameOnly = await autumnV2_2.post("/catalog.preview_update", {
			plans: [
				{ plan_id: plan.id, name: "Renamed Pro", items: [messagesItem(100)] },
			],
		});
		expectCatalogPreview({
			preview: nameOnly,
			planChanges: [
				{
					planId: plan.id,
					hasCustomers: true,
					willVersion: false,
				},
			],
		});

		// ── B: new_plan_id only (items unchanged) → no version ──
		const idOnly = await autumnV2_2.post("/catalog.preview_update", {
			plans: [
				{
					plan_id: plan.id,
					new_plan_id: "catalog_preview_wv_renamed",
					items: [messagesItem(100)],
				},
			],
		});
		expectCatalogPreview({
			preview: idOnly,
			planChanges: [
				{
					planId: plan.id,
					hasCustomers: true,
					willVersion: false,
				},
			],
		});

		// ── B: item change → versions (control) ──
		const itemChange = await autumnV2_2.post("/catalog.preview_update", {
			plans: [{ plan_id: plan.id, items: [messagesItem(500)] }],
		});
		expectCatalogPreview({
			preview: itemChange,
			planChanges: [
				{
					planId: plan.id,
					hasCustomers: true,
					willVersion: true,
					planExpanded: false,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog preview: feature diffing resolves features and surfaces update blockers")}`,
	async () => {
		const customerId = "catalog-preview-features";
		const plan = products.pro({
			id: "catalog_preview_feat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const newFeatureId = "catalog_preview_new_feature";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			// Attaching messages creates a customer entitlement for it.
			actions: [s.attach({ productId: plan.id })],
		});

		// ── C: a brand-new feature + a non-blockable rename of an existing one ──
		const allowed = await autumnV2_2.post("/catalog.preview_update", {
			expand: ["feature_changes.feature"],
			features: [
				{ feature_id: newFeatureId, name: "Brand New", type: "boolean" },
				{
					feature_id: TestFeature.Messages,
					name: "Messages Renamed",
					type: "metered",
					consumable: true,
				},
			],
		});
		expectFeaturePreviewCorrect({
			preview: allowed,
			featureId: newFeatureId,
			type: FeatureType.Boolean,
			noBlockers: true,
		});
		expectFeaturePreviewCorrect({
			preview: allowed,
			featureId: TestFeature.Messages,
			noBlockers: true,
		});

		// ── C: changing the type of an attached feature → blocked ──
		const blocked = await autumnV2_2.post("/catalog.preview_update", {
			features: [
				{ feature_id: TestFeature.Messages, name: "Messages", type: "boolean" },
			],
		});
		expectFeaturePreviewCorrect({
			preview: blocked,
			featureId: TestFeature.Messages,
			blockerCodes: ["attached_to_customer"],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog preview: a plan can reference a feature created in the same batch")}`,
	async () => {
		const customerId = "catalog-preview-batch-upsert";
		const newFeatureId = "catalog_preview_batch_feature";
		const planId = "catalog_preview_batch_plan";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false, paymentMethod: "success" })],
			actions: [],
		});

		// ── D: net-new feature + a plan that uses it, in one preview call ──
		const preview = await autumnV2_2.post("/catalog.preview_update", {
			expand: ["plan_changes.plan", "feature_changes.feature"],
			features: [
				{
					feature_id: newFeatureId,
					name: "Batch Feature",
					type: "metered",
					consumable: true,
				},
			],
			plans: [
				{
					plan_id: planId,
					name: "Batch Plan",
					items: [
						{
							feature_id: newFeatureId,
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		expectFeaturePreviewCorrect({
			preview,
			featureId: newFeatureId,
			type: FeatureType.Metered,
			noBlockers: true,
		});
		expectCatalogPreview({
			preview,
			planChanges: [
				{
					planId,
					items: [{ featureId: newFeatureId, included: 100 }],
				},
			],
		});
	},
);
