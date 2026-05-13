/**
 * Plan versioning reuses the previous version's Stripe resources where possible.
 *
 * When a plan with existing customers is updated with a new items list, the
 * V1 update handler (handleUpdatePlanV1) auto-creates a new product version via
 * handleVersionProductV2. That path calls handleNewProductItems with
 * { curPrices: latestProduct.prices, newVersion: true }. The carry-forward
 * inside handleNewProductItems must copy the previous version's
 * `stripe_*_id` fields onto each new-version price whose config still matches.
 *
 * Contract under test:
 *   - Versioning a plan with the same paid items (just adding a boolean entitlement)
 *     keeps every paid price's Stripe IDs intact on the new version.
 *   - Same for paid feature shapes (prepaid / consumable / allocated).
 *   - Negative: versioning with a changed item (price amount, tier behavior,
 *     billing_units) does NOT reuse stripe_price_id for that item.
 *
 * Implementation surface:
 *   server/src/internal/products/handlers/handleVersionProduct.ts — versioning entry.
 *   server/src/internal/products/handlers/handleUpdatePlan/handleUpdatePlanV1.ts — triggers versioning when customers exist + items differ.
 *   server/src/internal/products/product-items/productItemUtils/handleNewProductItems.ts — calls carryForwardStripeResources.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type CreatePlanItemParamsV1,
	BillingInterval,
	BillingMethod,
	type Price,
	priceStripeObjectsMatch,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const collectStripeIdsByFeatureKey = (
	prices: Price[],
): Map<string, Record<string, string | null>> => {
	const map = new Map<string, Record<string, string | null>>();
	for (const price of prices) {
		const config = price.config as Record<string, unknown>;
		const featureId = (config.feature_id as string | undefined) ?? "__fixed__";
		const billWhen = (config.bill_when as string | undefined) ?? "__none__";
		const key = `${featureId}|${billWhen}`;
		map.set(key, {
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: version a plan with same paid items + new boolean → all reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("versioning: add boolean entitlement → all paid Stripe IDs reused on new version")}`, async () => {
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
	const beforeIds = collectStripeIdsByFeatureKey(beforeProduct.prices);

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

	const afterIds = collectStripeIdsByFeatureKey(afterProduct.prices);

	for (const [key, before] of beforeIds.entries()) {
		const after = afterIds.get(key);
		expect(after).toBeDefined();
		if (!after) continue;
		expect(before.stripe_price_id).not.toBeNull();
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 (negative): versioning with prepaid amount change → stripe_price_id not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("versioning: prepaid amount change → stripe_price_id NOT reused on new version")}`, async () => {
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

	const beforeConfig = beforeMessages.config as Record<string, unknown>;
	const afterConfig = afterMessages.config as Record<string, unknown>;
	expect(beforeConfig.stripe_price_id ?? null).not.toBeNull();
	expect(afterConfig.stripe_price_id ?? null).not.toBeNull();
	expect(afterConfig.stripe_price_id).not.toBe(beforeConfig.stripe_price_id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 (negative): versioning with tier_behavior change → stripe_price_id not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("versioning: graduated → volume tier_behavior → stripe_price_id NOT reused on new version")}`, async () => {
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

	const beforeConfig = beforeMessages.config as Record<string, unknown>;
	const afterConfig = afterMessages.config as Record<string, unknown>;
	expect(beforeConfig.stripe_price_id ?? null).not.toBeNull();
	expect(afterConfig.stripe_price_id ?? null).not.toBeNull();
	expect(afterConfig.stripe_price_id).not.toBe(beforeConfig.stripe_price_id);
});
