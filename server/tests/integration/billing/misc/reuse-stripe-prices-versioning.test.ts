import { expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	BillingInterval,
	BillingMethod,
	type CreatePlanItemParamsV1,
	type FullProduct,
	type Price,
	priceStripeObjectsMatch,
	TierInfinite,
} from "@autumn/shared";
import { v2BillingStripePriceId } from "@tests/integration/utils/expectStripePriceResources";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const collectStripeIdsByFeatureKey = (
	product: FullProduct,
): Map<string, Record<string, string | null>> => {
	const map = new Map<string, Record<string, string | null>>();
	for (const price of product.prices) {
		const config = price.config as Record<string, unknown>;
		const featureId = (config.feature_id as string | undefined) ?? "__fixed__";
		const billWhen = (config.bill_when as string | undefined) ?? "__none__";
		const key = `${featureId}|${billWhen}`;
		map.set(key, {
			v2_billing_price_id: v2BillingStripePriceId({ price, product }),
			stripe_product_id: (config.stripe_product_id as string | null) ?? null,
			stripe_price_id: (config.stripe_price_id as string | null) ?? null,
			stripe_empty_price_id:
				(config.stripe_empty_price_id as string | null) ?? null,
			stripe_meter_id: (config.stripe_meter_id as string | null) ?? null,
			stripe_prepaid_price_v2_id:
				(config.stripe_prepaid_price_v2_id as string | null) ?? null,
			stripe_placeholder_price_id:
				(config.stripe_placeholder_price_id as string | null) ?? null,
		});
	}
	return map;
};

const findPriceForFeature = (
	prices: Price[],
	featureId: string,
): Price | undefined =>
	prices.find(
		(price) =>
			(price.config as Record<string, unknown>).feature_id === featureId,
	);

test.concurrent(
	`${chalk.yellowBright("versioning: add boolean entitlement → all paid Stripe IDs reused on new version")}`,
	async () => {
		const customerId = "reuse-version-add-bool";

		const proPlan = products.pro({
			id: "pro-version-add-bool",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.prepaidUsers({ billingUnits: 1 }),
				items.consumableWords({ includedUsage: 0 }),
				items.allocatedWorkflows({ includedUsage: 0 }),
			],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [s.billing.attach({ productId: proPlan.id })],
		});

		const beforeProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proPlan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const beforeIds = collectStripeIdsByFeatureKey(beforeProduct);

		const updatedItems = [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
			items.prepaidUsers({ billingUnits: 1 }),
			items.consumableWords({ includedUsage: 0 }),
			items.allocatedWorkflows({ includedUsage: 0 }),
			items.dashboard(),
		];

		await autumnV1.products.update(proPlan.id, { items: updatedItems });

		const afterProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proPlan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		expect(afterProduct.version).toBe(beforeProduct.version + 1);

		const afterIds = collectStripeIdsByFeatureKey(afterProduct);

		for (const [key, before] of beforeIds.entries()) {
			const after = afterIds.get(key);
			expect(after).toBeDefined();
			if (!after) continue;
			expect(before.v2_billing_price_id).not.toBeNull();
			expect(after.stripe_product_id).toBe(before.stripe_product_id);
			expect(after.stripe_price_id).toBe(before.stripe_price_id);
			expect(after.stripe_empty_price_id).toBe(before.stripe_empty_price_id);
			expect(after.stripe_meter_id).toBe(before.stripe_meter_id);
			expect(after.stripe_prepaid_price_v2_id).toBe(
				before.stripe_prepaid_price_v2_id,
			);
			expect(after.stripe_placeholder_price_id).toBe(
				before.stripe_placeholder_price_id,
			);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("versioning: prepaid amount change → stripe_price_id NOT reused on new version")}`,
	async () => {
		const customerId = "reuse-version-amount-change";

		const proPlan = products.pro({
			id: "pro-version-amount-change",
			items: [items.prepaidMessages({ includedUsage: 0, billingUnits: 100 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [s.billing.attach({ productId: proPlan.id })],
		});

		const beforeProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proPlan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const beforeMessages = findPriceForFeature(
			beforeProduct.prices,
			TestFeature.Messages,
		);
		expect(beforeMessages).toBeDefined();

		const updatedItems = [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 25 }),
		];

		await autumnV1.products.update(proPlan.id, { items: updatedItems });

		const afterProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proPlan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(afterProduct.version).toBe(beforeProduct.version + 1);

		const afterMessages = findPriceForFeature(
			afterProduct.prices,
			TestFeature.Messages,
		);
		expect(afterMessages).toBeDefined();
		if (!afterMessages || !beforeMessages) return;

		const beforeStripePriceId = v2BillingStripePriceId({
			price: beforeMessages,
			product: beforeProduct,
		});
		const afterStripePriceId = v2BillingStripePriceId({
			price: afterMessages,
			product: afterProduct,
		});
		expect(beforeStripePriceId).not.toBeNull();
		expect(afterStripePriceId).not.toBeNull();
		expect(afterStripePriceId).not.toBe(beforeStripePriceId);
	},
);

test.concurrent(
	`${chalk.yellowBright("versioning: graduated → volume tier_behavior → stripe_price_id NOT reused on new version")}`,
	async () => {
		const customerId = "reuse-version-tier-behavior";

		const proPlan = products.pro({
			id: "pro-version-tier-behavior",
			items: [items.tieredPrepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [s.billing.attach({ productId: proPlan.id })],
		});

		const beforeProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proPlan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const beforeMessages = findPriceForFeature(
			beforeProduct.prices,
			TestFeature.Messages,
		);

		const updatedItems = [
			items.monthlyPrice({ price: 20 }),
			items.volumePrepaidMessages({ includedUsage: 0 }),
		];

		await autumnV1.products.update(proPlan.id, { items: updatedItems });

		const afterProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: proPlan.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(afterProduct.version).toBe(beforeProduct.version + 1);

		const afterMessages = findPriceForFeature(
			afterProduct.prices,
			TestFeature.Messages,
		);
		expect(afterMessages).toBeDefined();
		if (!afterMessages || !beforeMessages) return;

		const beforeStripePriceId = v2BillingStripePriceId({
			price: beforeMessages,
			product: beforeProduct,
		});
		const afterStripePriceId = v2BillingStripePriceId({
			price: afterMessages,
			product: afterProduct,
		});
		expect(beforeStripePriceId).not.toBeNull();
		expect(afterStripePriceId).not.toBeNull();
		expect(afterStripePriceId).not.toBe(beforeStripePriceId);
	},
);
