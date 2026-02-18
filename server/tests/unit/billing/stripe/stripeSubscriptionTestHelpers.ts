/**
 * Shared test helpers for Stripe subscription-related tests.
 *
 * Used by:
 * - buildStripeSubscriptionItemsUpdate tests (subscription items update)
 * - buildStripePhasesUpdate tests (subscription schedule phases)
 *
 * Provides helpers for:
 * - Creating products with all price types (fixed, prepaid, consumable, allocated)
 * - Creating customer prices and entitlements for products
 * - Generating expected subscription items and phase items
 * - Assertion helpers for comparing subscription updates
 */

import { expect } from "bun:test";
import { FeatureUsageType } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";

// ============ TIME CONSTANTS ============

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const ONE_MONTH_MS = 30 * ONE_DAY_MS;
export const HALF_MONTH_MS = 15 * ONE_DAY_MS;

// ============ PRODUCT HELPERS ============

/**
 * Creates a product with all 4 price types: fixed, prepaid, consumable, allocated.
 * Also creates corresponding customer entitlements and options for usage-based prices.
 *
 * Default quantities:
 * - Fixed: 1
 * - Prepaid: 100 (from options.quantity)
 * - Consumable: undefined (metered) or 0 (entity empty price)
 * - Allocated: 5 (from usage = allowance - balance = 10 - 5)
 *
 * @param customerProductId - Required to link entitlements to the correct customer product
 */
export const createProductWithAllPriceTypes = ({
	productId,
	productName,
	customerProductId,
	isAddOn = false,
	prepaidQuantity = 100,
	allocatedUsage = 5,
}: {
	productId: string;
	productName: string;
	customerProductId: string;
	isAddOn?: boolean;
	prepaidQuantity?: number;
	allocatedUsage?: number;
}) => {
	const fixedPrice = prices.createFixed({
		id: `${productId}_fixed`,
		stripePriceId: `stripe_${productId}_fixed`,
	});

	const prepaidPrice = prices.createPrepaid({
		id: `${productId}_prepaid`,
		featureId: `${productId}_credits`,
		internalFeatureId: `internal_${productId}_credits`,
		stripePriceId: `stripe_${productId}_prepaid`,
		entitlementId: `ent_${productId}_credits`,
	});

	const consumablePrice = prices.createConsumable({
		id: `${productId}_consumable`,
		featureId: `${productId}_usage`,
		internalFeatureId: `internal_${productId}_usage`,
		stripePriceId: `stripe_${productId}_consumable`,
		stripeEmptyPriceId: `stripe_${productId}_consumable_empty`,
		entitlementId: `ent_${productId}_usage`,
	});

	const allocatedPrice = prices.createAllocated({
		id: `${productId}_allocated`,
		featureId: `${productId}_seats`,
		internalFeatureId: `internal_${productId}_seats`,
		stripePriceId: `stripe_${productId}_allocated`,
		entitlementId: `ent_${productId}_seats`,
	});

	const product = products.createFull({
		id: productId,
		name: productName,
		prices: [fixedPrice, prepaidPrice, consumablePrice, allocatedPrice],
		stripeProductId: `stripe_prod_${productId}`,
		isAddOn,
	});

	// Create customer entitlements for usage-based prices
	// Prepaid: full balance (no usage yet)
	const prepaidEntitlement = customerEntitlements.create({
		entitlementId: `ent_${productId}_credits`,
		featureId: `${productId}_credits`,
		internalFeatureId: `internal_${productId}_credits`,
		featureName: `${productName} Credits`,
		allowance: 100,
		balance: 100, // Full balance, no usage
		customerProductId,
	});

	// Consumable: no allowance (metered)
	const consumableEntitlement = customerEntitlements.create({
		entitlementId: `ent_${productId}_usage`,
		featureId: `${productId}_usage`,
		internalFeatureId: `internal_${productId}_usage`,
		featureName: `${productName} Usage`,
		allowance: 0,
		balance: 0,
		customerProductId,
	});

	// Allocated: has usage (allowance - balance = usage)
	// Must set usage_type: Continuous for isAllocatedCustomerEntitlement to return true
	const allocatedAllowance = 10;
	const allocatedEntitlement = customerEntitlements.create({
		entitlementId: `ent_${productId}_seats`,
		featureId: `${productId}_seats`,
		internalFeatureId: `internal_${productId}_seats`,
		featureName: `${productName} Seats`,
		allowance: allocatedAllowance,
		balance: allocatedAllowance - allocatedUsage, // Usage = allocatedUsage
		customerProductId,
		featureConfig: { usage_type: FeatureUsageType.Continuous },
	});

	// Feature options for prepaid quantity
	const prepaidOptions = {
		feature_id: `${productId}_credits`,
		internal_feature_id: `internal_${productId}_credits`,
		quantity: prepaidQuantity,
	};

	return {
		product,
		fixedPrice,
		prepaidPrice,
		consumablePrice,
		allocatedPrice,
		allPrices: [fixedPrice, prepaidPrice, consumablePrice, allocatedPrice],
		allEntitlements: [
			prepaidEntitlement,
			consumableEntitlement,
			allocatedEntitlement,
		],
		allOptions: [prepaidOptions],
		// Default quantities for assertions
		expectedQuantities: {
			fixed: 1,
			prepaid: prepaidQuantity,
			consumable: undefined, // metered
			consumableEntity: 0, // empty price
			allocated: allocatedUsage,
		},
	};
};

// ============ CUSTOMER PRICE HELPERS ============

/**
 * Creates customer prices for all prices in a product
 */
export const createCustomerPricesForProduct = ({
	prices: priceList,
	customerProductId,
}: {
	prices: ReturnType<typeof prices.createFixed>[];
	customerProductId: string;
}) => {
	return priceList.map((price) =>
		prices.createCustomer({ price, customerProductId }),
	);
};

// ============ STRIPE PRICE ID HELPERS ============

/**
 * Gets all stripe price IDs from a product helper result.
 * Note: As of current implementation, withEntity is hardcoded to false in customerProductToStripeItemSpecs,
 * so consumable prices always use the regular (non-empty) price ID.
 */
export const getStripePriceIds = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	{ isEntityLevel: _isEntityLevel = false }: { isEntityLevel?: boolean } = {},
): string[] => {
	// withEntity is hardcoded to false, so always use regular consumable price
	const consumablePriceId = `stripe_${product.product.id}_consumable`;

	return [
		`stripe_${product.product.id}_fixed`,
		`stripe_${product.product.id}_prepaid`,
		consumablePriceId,
		`stripe_${product.product.id}_allocated`,
	];
};

// ============ PHASE ITEM HELPERS ============

export type ExpectedPhaseItem = {
	price: string;
	quantity: number | undefined;
};

/**
 * Extracts price IDs from phase items
 */
export const getPhaseItemPriceIds = (items: { price?: string }[]): string[] => {
	return items.map((item) => item.price as string).sort();
};

/**
 * Verifies phase items contain exactly the expected price IDs
 */
export const expectPhaseItems = (
	items: { price?: string }[],
	expectedPriceIds: string[],
) => {
	const actualPriceIds = getPhaseItemPriceIds(items);
	expect(actualPriceIds).toEqual(expectedPriceIds.sort());
};

/**
 * Gets expected phase items with quantities for a product.
 * Uses the expectedQuantities from the product helper.
 *
 * @param fixedQuantityMultiplier - Multiplier for fixed quantity (e.g., 2 for customer + entity)
 */
export const getExpectedPhaseItems = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	{
		isEntityLevel: _isEntityLevel = false,
		fixedQuantityMultiplier = 1,
	}: { isEntityLevel?: boolean; fixedQuantityMultiplier?: number } = {},
): ExpectedPhaseItem[] => {
	const productId = product.product.id;
	const { expectedQuantities } = product;

	// withEntity is hardcoded to false, so always use regular consumable price
	const consumablePriceId = `stripe_${productId}_consumable`;
	const consumableQuantity = expectedQuantities.consumable;

	return [
		{
			price: `stripe_${productId}_fixed`,
			quantity: expectedQuantities.fixed * fixedQuantityMultiplier,
		},
		{
			price: `stripe_${productId}_prepaid`,
			quantity: expectedQuantities.prepaid,
		},
		{ price: consumablePriceId, quantity: consumableQuantity },
		{
			price: `stripe_${productId}_allocated`,
			quantity: expectedQuantities.allocated,
		},
	];
};

/**
 * Verifies phase items match expected items with quantities.
 * Sorts by price for comparison.
 */
export const expectPhaseItemsWithQuantities = (
	items: { price?: string; quantity?: number }[],
	expectedItems: ExpectedPhaseItem[],
) => {
	const sortByPrice = (a: { price?: string }, b: { price?: string }) =>
		(a.price ?? "").localeCompare(b.price ?? "");

	const actualSorted = [...items]
		.map((item) => ({ price: item.price as string, quantity: item.quantity }))
		.sort(sortByPrice);

	const expectedSorted = [...expectedItems].sort(sortByPrice);

	expect(actualSorted).toEqual(expectedSorted);
};

// ============ SUBSCRIPTION ITEMS UPDATE HELPERS ============

export type ExpectedSubscriptionItemUpdate = {
	id?: string;
	price?: string;
	quantity?: number;
	deleted?: boolean;
};

/**
 * Gets expected subscription item updates for creating a new product.
 * Uses the expectedQuantities from the product helper.
 *
 * Note: As of current implementation, withEntity is hardcoded to false in customerProductToStripeItemSpecs,
 * so consumable prices always use the regular (non-empty) price ID.
 */
export const getExpectedNewProductItems = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	{ isEntityLevel: _isEntityLevel = false }: { isEntityLevel?: boolean } = {},
): ExpectedSubscriptionItemUpdate[] => {
	const productId = product.product.id;
	const { expectedQuantities } = product;

	// withEntity is hardcoded to false, so always use regular consumable price (metered, no quantity)
	const consumablePriceId = `stripe_${productId}_consumable`;
	const consumableQuantity = expectedQuantities.consumable;

	const items: ExpectedSubscriptionItemUpdate[] = [
		{
			price: `stripe_${productId}_fixed`,
			quantity: expectedQuantities.fixed,
		},
		{
			price: `stripe_${productId}_prepaid`,
			quantity: expectedQuantities.prepaid,
		},
		{
			price: `stripe_${productId}_allocated`,
			quantity: expectedQuantities.allocated,
		},
	];

	// Add consumable - metered prices don't include quantity
	if (consumableQuantity === undefined) {
		items.push({ price: consumablePriceId });
	} else {
		items.push({ price: consumablePriceId, quantity: consumableQuantity });
	}

	return items;
};

/**
 * Verifies subscription item updates match expected updates.
 * Handles both new items (with price) and updates/deletions (with id).
 */
export const expectSubscriptionItemsUpdate = (
	actual: ExpectedSubscriptionItemUpdate[],
	expected: ExpectedSubscriptionItemUpdate[],
) => {
	// Sort by price for new items, by id for updates
	const sortItems = (
		a: ExpectedSubscriptionItemUpdate,
		b: ExpectedSubscriptionItemUpdate,
	) => {
		if (a.price && b.price) return a.price.localeCompare(b.price);
		if (a.id && b.id) return a.id.localeCompare(b.id);
		return (a.price ?? a.id ?? "").localeCompare(b.price ?? b.id ?? "");
	};

	const actualSorted = [...actual].sort(sortItems);
	const expectedSorted = [...expected].sort(sortItems);

	expect(actualSorted).toEqual(expectedSorted);
};

/**
 * Creates stripe subscription items from product's expected prices.
 * Useful for setting up existing subscription state.
 *
 * Note: As of current implementation, withEntity is hardcoded to false in customerProductToStripeItemSpecs,
 * so consumable prices always use the regular (non-empty) price ID. Metered consumable prices
 * are excluded by default because they don't have a meaningful quantity to compare.
 *
 * @param includeMetered - If true, includes metered consumable. Use this when testing scenarios
 *                         that need the full item set.
 */
export const createStripeItemsFromProduct = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	{
		isEntityLevel: _isEntityLevel = false,
		itemIdPrefix = "si",
		includeMetered = false,
	}: {
		isEntityLevel?: boolean;
		itemIdPrefix?: string;
		includeMetered?: boolean;
	} = {},
): { id: string; priceId: string; quantity: number }[] => {
	const productId = product.product.id;
	const { expectedQuantities } = product;

	const items: { id: string; priceId: string; quantity: number }[] = [
		{
			id: `${itemIdPrefix}_${productId}_fixed`,
			priceId: `stripe_${productId}_fixed`,
			quantity: expectedQuantities.fixed,
		},
		{
			id: `${itemIdPrefix}_${productId}_prepaid`,
			priceId: `stripe_${productId}_prepaid`,
			quantity: expectedQuantities.prepaid,
		},
		{
			id: `${itemIdPrefix}_${productId}_allocated`,
			priceId: `stripe_${productId}_allocated`,
			quantity: expectedQuantities.allocated,
		},
	];

	// Only include metered if explicitly requested (withEntity is hardcoded to false,
	// so always use regular consumable price)
	if (includeMetered) {
		items.push({
			id: `${itemIdPrefix}_${productId}_consumable`,
			priceId: `stripe_${productId}_consumable`,
			quantity: 0, // Metered prices in Stripe typically have 0 or undefined
		});
	}

	return items;
};
