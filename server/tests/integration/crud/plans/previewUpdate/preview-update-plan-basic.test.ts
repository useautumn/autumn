import { expect, test } from "bun:test";
import {
	BillingInterval,
	PreviewUpdatePlanExpand,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectPreviewUpdatePlanCorrect } from "./utils/expectPreviewUpdatePlanCorrect.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

/**
 * Contract under test:
 * - plans.preview_update returns schema-aligned core preview fields.
 * - item_changes contains full resolved plan items, not remove-item filters.
 * - customize.price and price_change are present when the incoming price changes.
 * - customize.price and price_change are omitted when the incoming price resolves
 *   to the current price, including default interval_count normalization.
 */

test.concurrent(
	`${chalk.yellowBright("plans preview_update: pro with customer previews pro v2 versioning")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const customerId = `plan_preview_basic_${suffix}`;
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const beforeFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const compactPreview = await autumnV2_3.plans.previewUpdate({
			plan_id: pro.id,
			new_plan_id: `${pro.id}_v2`,
			name: "Pro v2",
			items: [messagesItem(500)],
		});

		expectPreviewUpdatePlanCorrect({
			preview: compactPreview,
			expected: {
				plan_id: pro.id,
				plan: undefined,
				has_customers: true,
				versionable: true,
				variants: [],
			},
		});

		const preview = await autumnV2_3.plans.previewUpdate({
			plan_id: pro.id,
			new_plan_id: `${pro.id}_v2`,
			name: "Pro v2",
			items: [messagesItem(500)],
			expand: [PreviewUpdatePlanExpand.Plan],
		});

		expectPreviewUpdatePlanCorrect({
			preview,
			expected: {
				plan_id: pro.id,
				plan: { id: `${pro.id}_v2` },
				has_customers: true,
				versionable: true,
				customize: {
					remove_items: [
						{
							feature_id: TestFeature.Messages,
							interval: ResetInterval.Month,
						},
					],
					add_items: [
						{
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
				price_change: undefined,
				previous_attributes: {
					id: pro.id,
					name: pro.name,
				},
				variants: [],
				item_changes: [
					{
						action: "deleted",
						feature_id: TestFeature.Messages,
						item: {
							feature_id: TestFeature.Messages,
							included: 100,
							reset: { interval: ResetInterval.Month },
						},
					},
					{
						action: "created",
						feature_id: TestFeature.Messages,
						item: {
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: ResetInterval.Month },
						},
					},
				],
			},
		});

		const afterFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(afterFull.internal_id).toBe(beforeFull.internal_id);
		expect(afterFull.version).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans preview_update: variant diffs mirror propagated base item changes")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const customerId = `plan_preview_variant_${suffix}`;
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const variantId = `${pro.id}_annual`;
		await autumnV2_3.plans.createVariant({
			base_plan_id: pro.id,
			variant_plan_id: variantId,
			name: "Pro Annual",
		});

		const preview = await autumnV2_3.plans.previewUpdate({
			plan_id: pro.id,
			items: [messagesItem(500)],
		});

		expectPreviewUpdatePlanCorrect({
			preview,
			logPreview: false,
			expected: {
				plan_id: pro.id,
				has_customers: false,
				versionable: false,
				customize: {
					remove_items: [
						{
							feature_id: TestFeature.Messages,
							interval: ResetInterval.Month,
						},
					],
					add_items: [
						{
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
				price_change: undefined,
				variants: [
					expect.objectContaining({
						plan_id: variantId,
						has_customers: false,
						versionable: false,
						customize: expect.objectContaining({
							remove_items: [
								expect.objectContaining({
									feature_id: TestFeature.Messages,
									interval: ResetInterval.Month,
								}),
							],
							add_items: [
								expect.objectContaining({
									feature_id: TestFeature.Messages,
									included: 500,
									reset: { interval: ResetInterval.Month },
								}),
							],
						}),
						conflicts: [],
					}),
				],
			},
		});

		const variantPreview = preview.variants[0];
		expect(variantPreview.price_change).toBeUndefined();
		expect(variantPreview.item_changes).toHaveLength(2);
		expect(variantPreview.item_changes[0]).toMatchObject({
			action: "deleted",
			feature_id: TestFeature.Messages,
			item: {
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		});
		expect(variantPreview.item_changes[1]).toMatchObject({
			action: "created",
			feature_id: TestFeature.Messages,
			item: {
				feature_id: TestFeature.Messages,
				included: 500,
				reset: { interval: ResetInterval.Month },
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plans preview_update: price changes only surface when resolved price changes")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const customerId = `plan_preview_price_${suffix}`;
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const amountChanged = await autumnV2_3.plans.previewUpdate({
			plan_id: pro.id,
			price: {
				amount: 30,
				interval: BillingInterval.Month,
			},
		});

		expectPreviewUpdatePlanCorrect({
			preview: amountChanged,
			logPreview: false,
			expected: {
				plan_id: pro.id,
				has_customers: true,
				versionable: true,
				customize: {
					price: {
						amount: 30,
						interval: BillingInterval.Month,
					},
				},
				price_change: {
					previous: {
						amount: 20,
						interval: BillingInterval.Month,
					},
					current: {
						amount: 30,
						interval: BillingInterval.Month,
					},
				},
				previous_attributes: null,
				item_changes: [],
				variants: [],
			},
		});

		const amountUnchanged = await autumnV2_3.plans.previewUpdate({
			plan_id: pro.id,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
			},
		});

		expectPreviewUpdatePlanCorrect({
			preview: amountUnchanged,
			logPreview: false,
			expected: {
				plan_id: pro.id,
				has_customers: true,
				versionable: false,
				customize: null,
				price_change: undefined,
				previous_attributes: null,
				item_changes: [],
				variants: [],
			},
		});

		const intervalChanged = await autumnV2_3.plans.previewUpdate({
			plan_id: pro.id,
			price: {
				amount: 20,
				interval: BillingInterval.Year,
				interval_count: 2,
			},
		});

		expectPreviewUpdatePlanCorrect({
			preview: intervalChanged,
			logPreview: false,
			expected: {
				plan_id: pro.id,
				has_customers: true,
				versionable: true,
				customize: {
					price: {
						amount: 20,
						interval: BillingInterval.Year,
						interval_count: 2,
					},
				},
				price_change: {
					previous: {
						amount: 20,
						interval: BillingInterval.Month,
					},
					current: {
						amount: 20,
						interval: BillingInterval.Year,
						interval_count: 2,
					},
				},
				previous_attributes: null,
				item_changes: [],
				variants: [],
			},
		});

		const intervalUnchanged = await autumnV2_3.plans.previewUpdate({
			plan_id: pro.id,
			price: {
				amount: 20,
				interval: BillingInterval.Month,
				interval_count: 1,
			},
		});

		expectPreviewUpdatePlanCorrect({
			preview: intervalUnchanged,
			logPreview: false,
			expected: {
				plan_id: pro.id,
				has_customers: true,
				versionable: false,
				customize: null,
				price_change: undefined,
				previous_attributes: null,
				item_changes: [],
				variants: [],
			},
		});
	},
);
