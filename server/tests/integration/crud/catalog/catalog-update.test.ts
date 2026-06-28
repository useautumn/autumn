/**
 * TDD test for the catalog batch endpoints.
 *
 * Contract under test:
 *   POST /v1/catalog.preview_update (read-only, NO persist):
 *     - plans[]: PlanUpdatePreview with the proposed ApiPlanV1 under `plan`
 *     - does NOT persist (plans.get still returns the original plan)
 *   POST /v1/catalog.update:
 *     - creates a new plan when plan_id does not exist
 *     - returns { plans: ApiPlanV1[], features: ApiFeatureV1[] }
 *
 * Pre-impl red: routes/handlers do not exist (404 / undefined fields).
 * Post-impl green: catalog handlers resolve params into the shared plan preview
 *   shape and upsert via create/updateProduct.
 */

import { beforeAll, expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature, getFeatures } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectCatalogPreview } from "./utils/expectCatalogPreview.js";

beforeAll(async () => {
	const desiredFeatures = Object.values(getFeatures({ orgId: ctx.org.id }));
	const existingFeatures = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const existingFeatureIds = new Set(
		existingFeatures.map((feature) => feature.id),
	);
	const missingFeatures = desiredFeatures.filter(
		(feature) => !existingFeatureIds.has(feature.id),
	);

	if (missingFeatures.length > 0) {
		await FeatureService.insert({
			db: ctx.db,
			data: missingFeatures,
			logger: console,
		});
	}
});

const catchErr = async (fn: () => Promise<unknown>) => {
	try {
		await fn();
		return null;
	} catch (error: unknown) {
		return error as { code?: string; statusCode?: number };
	}
};

test(`${chalk.yellowBright("catalog: preview_update resolves shared plan preview without persisting")}`, async () => {
	const prod = products.pro({
		id: "catalog_preview_pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		setup: [],
		actions: [],
	});
	await autumnV2_2.post("/catalog.update", {
		plans: [
			{
				plan_id: prod.id,
				name: prod.name,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: "month" },
					},
				],
			},
		],
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
				hasCustomers: false,
				willVersion: false,
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
				hasCustomers: false,
				willVersion: false,
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
});

test(`${chalk.yellowBright("catalog: update honors force_version like plans.update")}`, async () => {
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
});

test(`${chalk.yellowBright("catalog: update targets exact historical plan version in place")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_exact_version_${suffix}`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId: `catalog-exact-version-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				force_version: true,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: "month" },
					},
				],
			},
		],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				version: 1,
				name: prod.name,
				disable_version: true,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 150,
						reset: { interval: "month" },
					},
				],
			},
		],
	});

	const [v1, v2] = await Promise.all([
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 1,
		}),
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 2,
		}),
	]);

	expect(
		v1.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(150);
	expect(
		v2.entitlements.find(
			(entitlement) => entitlement.feature.id === TestFeature.Messages,
		)?.allowance,
	).toBe(200);
});

test(`${chalk.yellowBright("catalog: update can draft migration for exact historical version")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_exact_migration_${suffix}`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId: `catalog-exact-migration-${suffix}`,
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: "month" },
					},
				],
			},
		],
	});
	await autumnV2_2.billing.attach({
		customer_id: `catalog-exact-migration-${suffix}`,
		plan_id: planId,
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				force_version: true,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: "month" },
					},
				],
			},
		],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				version: 1,
				name: prod.name,
				disable_version: true,
				create_migration: true,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 150,
						reset: { interval: "month" },
					},
				],
			},
		],
	});

	const migrations = await migrationRepo.get({ ctx });
	const migration = migrations.find((candidate) =>
		candidate.id.startsWith("plan-migrate-1-"),
	);
	expect(migration?.operations).not.toBeNull();
	const [operation] = migration?.operations?.customer ?? [];

	expect(operation).toMatchObject({
		type: "update_plan",
		version: 1,
		plan_filter: {
			plan_id: planId,
			custom: false,
		},
	});
});

test(`${chalk.yellowBright("catalog: preview_update marks selected variant propagation targets")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_preview_variants_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, autumnV2_3 } = await initScenario({
		customerId: `catalog-preview-variants-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_3.plans.createVariant({
		base_plan_id: planId,
		variant_plan_id: variantId,
		name: "Annual",
	});

	const planUpdate = {
		plan_id: planId,
		name: prod.name,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 500,
				reset: { interval: "month" },
			},
		],
	};

	const unselected = await autumnV2_2.post("/catalog.preview_update", {
		plans: [planUpdate],
	});
	const unselectedVariant = unselected.plan_changes[0].variants[0];

	expect(unselectedVariant).toMatchObject({
		plan_id: variantId,
		name: "Annual",
		will_apply: false,
	});

	const selected = await autumnV2_2.post("/catalog.preview_update", {
		plans: [
			{
				...planUpdate,
				variants: [
					{
						variant_plan_id: variantId,
						customize: unselectedVariant.customize,
					},
				],
			},
		],
	});
	const selectedVariant = selected.plan_changes[0].variants[0];

	expect(selectedVariant).toMatchObject({
		plan_id: variantId,
		name: "Annual",
		will_apply: true,
	});
});

test(`${chalk.yellowBright("catalog: preview_update leaves no-op base variant previews as none")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_preview_noop_variants_${suffix}`;
	const variantId = `${planId}_annual`;

	const { autumnV2_2 } = await initScenario({
		customerId: `catalog-preview-noop-variants-${suffix}`,
		setup: [],
		actions: [],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: "No-op Variant Base",
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: "month" },
					},
				],
				variants: [
					{
						variant_plan_id: variantId,
						name: "Annual",
						customize: {
							remove_items: [
								{ feature_id: TestFeature.Messages, interval: "month" },
							],
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: 1200,
									reset: { interval: "year" },
								},
							],
						},
					},
				],
			},
		],
	});

	const preview = await autumnV2_2.catalog.previewUpdate({
		plans: [
			{
				plan_id: planId,
				name: "No-op Variant Base",
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: "month" },
					},
				],
			},
		],
	});
	const [planChange] = preview.plan_changes;
	const [variantChange] = planChange.variants;

	expect(planChange).toMatchObject({
		action: "none",
		customize: null,
		item_changes: [],
		previous_attributes: null,
	});
	expect(variantChange).toMatchObject({
		plan_id: variantId,
		customize: null,
		item_changes: [],
		previous_attributes: null,
		will_apply: false,
	});
});

test(`${chalk.yellowBright("catalog: preview_update includes auto-propagated variant settings")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_preview_settings_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, autumnV2_3 } = await initScenario({
		customerId: `catalog-preview-settings-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_3.plans.createVariant({
		base_plan_id: planId,
		variant_plan_id: variantId,
		name: "Annual",
	});

	const preview = await autumnV2_2.catalog.previewUpdate({
		plans: [
			{
				plan_id: planId,
				name: "Base Renamed",
				add_on: true,
				group: "team",
				config: { ignore_past_due: true },
			},
		],
	});
	const variantPreview = preview.plan_changes[0].variants[0];

	expect(variantPreview).toMatchObject({
		plan_id: variantId,
		will_apply: false,
		previous_attributes: {
			name: "Annual",
			add_on: false,
		},
	});
	expect(variantPreview.previous_attributes?.group).toBe(null);
});

test(`${chalk.yellowBright("catalog: preview_update variant customize is relative to updated base")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_preview_customize_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId: `catalog-preview-customize-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				variants: [
					{
						variant_plan_id: variantId,
						name: "Annual",
						customize: {
							price: { amount: 120, interval: "year" },
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: "month",
								},
							],
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: 1200,
									reset: { interval: "year" },
								},
							],
						},
					},
				],
			},
		],
	});

	const preview = await autumnV2_2.catalog.previewUpdate({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: "month" },
					},
				],
				variants: [
					{
						variant_plan_id: variantId,
						name: "Annual",
						customize: {
							price: { amount: 240, interval: "year" },
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: "month",
								},
							],
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: 2400,
									reset: { interval: "year" },
								},
							],
						},
					},
				],
			},
		],
	});
	const variantPreview = preview.plan_changes[0].variants[0];

	expect(variantPreview.will_apply).toBe(true);
	expect(variantPreview.customize?.add_items?.[0]).toMatchObject({
		feature_id: TestFeature.Messages,
		included: 2400,
		reset: { interval: "year" },
	});
});

test(`${chalk.yellowBright("catalog: preview_update rejects duplicate base and variant updates")}`, async () => {
	const { autumnV2_2 } = await initScenario({
		setup: [],
		actions: [],
	});

	const selfErr = await catchErr(() =>
		autumnV2_2.catalog.previewUpdate({
			plans: [
				{
					plan_id: "catalog_duplicate_self",
					name: "Duplicate Self",
					variants: [
						{
							variant_plan_id: "catalog_duplicate_self",
							name: "Duplicate Self",
							customize: { price: null },
						},
					],
				},
			],
		}),
	);
	expect(selfErr?.code).toBe(ErrCode.InvalidPropagationTarget);

	const duplicateErr = await catchErr(() =>
		autumnV2_2.catalog.previewUpdate({
			plans: [
				{
					plan_id: "catalog_duplicate_base",
					name: "Duplicate Base",
					variants: [
						{
							variant_plan_id: "catalog_duplicate_variant",
							name: "Duplicate Variant",
							customize: { price: null },
						},
					],
				},
				{
					plan_id: "catalog_duplicate_variant",
					name: "Duplicate Variant",
				},
			],
		}),
	);
	expect(duplicateErr?.code).toBe(ErrCode.InvalidPropagationTarget);

	const duplicateVariantErr = await catchErr(() =>
		autumnV2_2.catalog.previewUpdate({
			plans: [
				{
					plan_id: "catalog_duplicate_variant_base",
					name: "Duplicate Variant Base",
					variants: [
						{
							variant_plan_id: "catalog_duplicate_variant_twice",
							name: "Duplicate Variant",
							customize: { price: null },
						},
						{
							variant_plan_id: "catalog_duplicate_variant_twice",
							name: "Duplicate Variant",
							customize: { price: null },
						},
					],
				},
			],
		}),
	);
	expect(duplicateVariantErr?.code).toBe(ErrCode.InvalidPropagationTarget);
});

test(`${chalk.yellowBright("catalog: update rejects duplicate base and variant updates")}`, async () => {
	const { autumnV2_2 } = await initScenario({
		setup: [],
		actions: [],
	});

	const err = await catchErr(() =>
		autumnV2_2.catalog.update({
			plans: [
				{
					plan_id: "catalog_update_duplicate_base",
					name: "Duplicate Base",
					variants: [
						{
							variant_plan_id: "catalog_update_duplicate_variant",
							name: "Duplicate Variant",
							customize: { price: null },
						},
					],
				},
				{
					plan_id: "catalog_update_duplicate_variant",
					name: "Duplicate Variant",
				},
			],
		}),
	);

	expect(err?.code).toBe(ErrCode.InvalidPropagationTarget);
});

test(`${chalk.yellowBright("catalog: update propagates plan updates to selected variants")}`, async () => {
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
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 500,
						reset: { interval: "month" },
					},
				],
				variants: [
					{
						variant_plan_id: variantId,
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: "month",
								},
							],
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: 500,
									reset: { interval: "month" },
								},
							],
						},
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
});

test(`${chalk.yellowBright("catalog: update auto-propagates base settings to variants")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_settings_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, autumnV2_3 } = await initScenario({
		customerId: `catalog-settings-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_3.plans.createVariant({
		base_plan_id: planId,
		variant_plan_id: variantId,
		name: "Annual",
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: "Base Renamed",
				add_on: true,
				group: "team",
				config: { ignore_past_due: true },
			},
		],
	});

	const variant = await autumnV2_2.post("/plans.get", {
		plan_id: variantId,
	});
	expect(variant.name).toBe("Base Renamed");
	expect(variant.add_on).toBe(true);
	expect(variant.group).toBe("team");
	expect(variant.config?.ignore_past_due).toBe(true);
});

test(`${chalk.yellowBright("catalog: preview_update does not propagate auto_enable to variants")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_auto_enable_${suffix}`;
	const variantId = `${planId}_variant`;
	const prod = products.base({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, autumnV2_3 } = await initScenario({
		customerId: `catalog-auto-enable-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_3.plans.createVariant({
		base_plan_id: planId,
		variant_plan_id: variantId,
		name: "Variant",
	});

	const preview = await autumnV2_2.catalog.previewUpdate({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				auto_enable: true,
			},
		],
	});

	const variantPreview = preview.plan_changes[0].variants[0];
	expect(variantPreview).toMatchObject({
		plan_id: variantId,
		will_apply: false,
		previous_attributes: null,
	});
});

test(`${chalk.yellowBright("catalog: variant customize is relative to updated base")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_customize_base_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId: `catalog-customize-base-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				variants: [
					{
						variant_plan_id: variantId,
						name: "Annual",
						customize: {
							price: { amount: 120, interval: "year" },
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: "month",
								},
							],
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: 1200,
									reset: { interval: "year" },
								},
							],
						},
					},
				],
			},
		],
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: "month" },
					},
				],
				variants: [
					{
						variant_plan_id: variantId,
						name: "Annual",
						customize: {
							price: { amount: 240, interval: "year" },
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									interval: "month",
								},
							],
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: 2400,
									reset: { interval: "year" },
								},
							],
						},
					},
				],
			},
		],
	});

	const variant = await autumnV2_2.post("/plans.get", {
		plan_id: variantId,
	});
	expect(variant.price).toMatchObject({
		amount: 240,
		interval: "year",
	});
	const messageItems = variant.items.filter(
		(entry: { feature_id: string }) =>
			entry.feature_id === TestFeature.Messages,
	);
	expect(messageItems).toHaveLength(1);
	expect(messageItems[0]).toMatchObject({
		included: 2400,
		reset: { interval: "year" },
	});
});

test(`${chalk.yellowBright("catalog: variant update dedupes inherited boolean add_items")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_variant_bool_dedupe_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.dashboard()],
	});

	const { autumnV2_2, autumnV2_3 } = await initScenario({
		customerId: `catalog-variant-bool-dedupe-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_3.plans.createVariant({
		base_plan_id: planId,
		variant_plan_id: variantId,
		name: "Annual",
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				variants: [
					{
						variant_plan_id: variantId,
						customize: {
							add_items: [{ feature_id: TestFeature.Dashboard }],
						},
					},
				],
			},
		],
	});

	const variant = await autumnV2_2.post("/plans.get", {
		plan_id: variantId,
	});

	let dashboardCount = 0;
	for (const item of variant.items) {
		if (item.feature_id === TestFeature.Dashboard) dashboardCount += 1;
	}

	expect(dashboardCount).toBe(1);
});

test(`${chalk.yellowBright("catalog: update upserts variant-only plan changes")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_variant_only_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId: `catalog-variant-only-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_2.post("/catalog.update", {
		plans: [
			{
				plan_id: planId,
				name: prod.name,
				variants: [
					{
						variant_plan_id: variantId,
						name: "Annual",
						customize: {
							price: { amount: 120, interval: "year" },
						},
					},
				],
			},
		],
	});

	const variant = await autumnV2_2.post("/plans.get", {
		plan_id: variantId,
	});
	expect(variant.name).toBe("Annual");
	expect(variant.price).toMatchObject({
		amount: 120,
		interval: "year",
	});
});

test(`${chalk.yellowBright("plans.update: variants field upserts missing variants")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `plans_update_variant_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId: `plans-update-variant-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_2.post("/plans.update", {
		plan_id: planId,
		name: prod.name,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 250,
				reset: { interval: "month" },
			},
		],
		variants: [
			{
				variant_plan_id: variantId,
				name: "Annual",
				customize: {
					price: { amount: 120, interval: "year" },
				},
			},
		],
	});

	const variant = await autumnV2_2.post("/plans.get", {
		plan_id: variantId,
	});
	expect(variant.name).toBe("Annual");
	expect(variant.price).toMatchObject({
		amount: 120,
		interval: "year",
	});
	const item = variant.items.find(
		(entry: { feature_id: string }) =>
			entry.feature_id === TestFeature.Messages,
	);
	expect(item?.included).toBe(250);
});

test(`${chalk.yellowBright("plans.update: rejects direct settings changes on variants")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `plans_update_variant_settings_${suffix}`;
	const variantId = `${planId}_annual`;
	const prod = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, autumnV2_3 } = await initScenario({
		customerId: `plans-update-variant-settings-${suffix}`,
		setup: [s.products({ list: [prod], prefix: "" })],
		actions: [],
	});

	await autumnV2_3.plans.createVariant({
		base_plan_id: planId,
		variant_plan_id: variantId,
		name: "Annual",
	});

	const err = await catchErr(() =>
		autumnV2_2.post("/plans.update", {
			plan_id: variantId,
			add_on: true,
		}),
	);

	expect(err?.code).toBe(ErrCode.InvalidPropagationTarget);

	await autumnV2_2.post("/plans.update", {
		plan_id: variantId,
		name: "Renamed Annual",
		group: "",
	});

	const renamedVariant = await autumnV2_2.post("/plans.get", {
		plan_id: variantId,
	});
	expect(renamedVariant.name).toBe("Renamed Annual");
});

test(`${chalk.yellowBright("catalog: update creates a new plan in one call")}`, async () => {
	const { autumnV2_2 } = await initScenario({
		setup: [],
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
});

test(`${chalk.yellowBright("catalog: update creates a plan referencing a feature created in the same call")}`, async () => {
	// Regression: the plan 404'd ("feature not found") because plan creation
	// resolved features against the request-start snapshot, which did not
	// include the feature created earlier in the same batch.
	const { autumnV2_2 } = await initScenario({
		setup: [],
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
});
