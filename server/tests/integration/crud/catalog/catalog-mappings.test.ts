import { expect, test } from "bun:test";
import { ProcessorType, type Price } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

type StripeConfig = Price["config"] & {
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	stripe_empty_price_id?: string | null;
	stripe_prepaid_price_v2_id?: string | null;
	stripe_meter_id?: string | null;
};

const findBasePrice = (prices: Price[]) =>
	prices.find((price) => !(price.config as StripeConfig).feature_id);

const findMessagesPrice = (prices: Price[]) =>
	prices.find(
		(price) => (price.config as StripeConfig).feature_id === TestFeature.Messages,
	);

const expectPriceStripeProduct = ({
	price,
	stripeProductId,
}: {
	price: Price | undefined;
	stripeProductId: string | null;
}) => {
	expect(price).toBeDefined();
	expect((price!.config as StripeConfig).stripe_product_id ?? null).toBe(
		stripeProductId,
	);
};

test(
	`${chalk.yellowBright("catalog mappings: update maps product/base price and item price")}`,
	async () => {
		const customerId = "catalog-mappings-basic-customer";
		const planId = "catalog_mappings_basic";
		const product = products.pro({
			id: planId,
			items: [items.consumableMessages({ includedUsage: 100, price: 0.25 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.products({ list: [product], prefix: "", createInStripe: false })],
			actions: [],
		});

		const original = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		const originalBasePrice = findBasePrice(original.prices)!;
		const originalMessagesPrice = findMessagesPrice(original.prices)!;

		await PriceService.update({
			db: ctx.db,
			id: originalBasePrice.id,
			update: {
				config: {
					...originalBasePrice.config,
					stripe_product_id: "prod_old_base",
					stripe_price_id: "price_old_base",
				},
			},
		});
		const originalMessagesConfig: StripeConfig = {
			...originalMessagesPrice.config,
			stripe_product_id: "prod_old_messages",
			stripe_price_id: "price_old_messages",
			stripe_meter_id: "meter_old_messages",
		};

		await PriceService.update({
			db: ctx.db,
			id: originalMessagesPrice.id,
			update: {
				config: originalMessagesConfig,
			},
		});

		const response = await autumnV2_2.post("/catalog.update_mappings", {
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_catalog_plan",
				},
			],
			item_mappings: [
				{
					plan_id: planId,
					item: {
						feature_id: TestFeature.Messages,
						billing_method: "usage_based",
					},
					stripe_product_id: "prod_catalog_messages",
				},
			],
		});

		const mappedPlan = response.plans.find(
			(plan: { plan: { id: string } }) => plan.plan.id === planId,
		);
		expect(mappedPlan.plan_mapping.mapping.stripe_product_id).toBe(
			"prod_catalog_plan",
		);
		expect(mappedPlan.item_mappings[0].mapping.stripe_product_id).toBe(
			"prod_catalog_messages",
		);

		const updated = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planId,
		});
		expect(updated.processor).toEqual({
			id: "prod_catalog_plan",
			type: ProcessorType.Stripe,
		});

		const basePrice = findBasePrice(updated.prices);
		const messagesPrice = findMessagesPrice(updated.prices);
		expectPriceStripeProduct({
			price: basePrice,
			stripeProductId: "prod_catalog_plan",
		});
		expectPriceStripeProduct({
			price: messagesPrice,
			stripeProductId: "prod_catalog_messages",
		});
		expect((basePrice!.config as StripeConfig).stripe_price_id).toBeNull();
		expect((messagesPrice!.config as StripeConfig).stripe_price_id).toBeNull();
		expect((messagesPrice!.config as StripeConfig).stripe_meter_id).toBeNull();
	},
);

test(
	`${chalk.yellowBright("catalog mappings: update applies to every version of a plan")}`,
	async () => {
		const customerId = "catalog-mappings-versions-customer";
		const planId = "catalog_mappings_versions";
		const product = products.pro({
			id: planId,
			items: [items.consumableMessages({ includedUsage: 100, price: 0.25 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.products({ list: [product], prefix: "", createInStripe: false })],
			actions: [],
		});

		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: planId,
					name: product.name,
					force_version: true,
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: "month" },
							price: {
								amount: 0.5,
								billing_units: 1,
								billing_method: "usage_based",
								interval: "month",
							},
						},
					],
				},
			],
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: "prod_all_versions",
					apply_to_prices: "all_prices",
				},
			],
			item_mappings: [
				{
					plan_id: planId,
					item: {
						feature_id: TestFeature.Messages,
						billing_method: "usage_based",
					},
					stripe_product_id: "prod_messages_all_versions",
				},
			],
		});

		const versions = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			inIds: [planId],
			returnAll: true,
		});

		expect(versions.length).toBe(2);
		for (const version of versions) {
			expect(version.processor).toEqual({
				id: "prod_all_versions",
				type: ProcessorType.Stripe,
			});
			expectPriceStripeProduct({
				price: findBasePrice(version.prices),
				stripeProductId: "prod_all_versions",
			});
			expectPriceStripeProduct({
				price: findMessagesPrice(version.prices),
				stripeProductId: "prod_messages_all_versions",
			});
		}
	},
);
