import { expect } from "bun:test";
import { FeatureUsageType } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const ONE_MONTH_MS = 30 * ONE_DAY_MS;
export const HALF_MONTH_MS = 15 * ONE_DAY_MS;

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

	const prepaidEntitlement = customerEntitlements.create({
		entitlementId: `ent_${productId}_credits`,
		featureId: `${productId}_credits`,
		internalFeatureId: `internal_${productId}_credits`,
		featureName: `${productName} Credits`,
		allowance: 100,
		balance: 100,
		customerProductId,
	});

	const consumableEntitlement = customerEntitlements.create({
		entitlementId: `ent_${productId}_usage`,
		featureId: `${productId}_usage`,
		internalFeatureId: `internal_${productId}_usage`,
		featureName: `${productName} Usage`,
		allowance: 0,
		balance: 0,
		customerProductId,
	});

	const allocatedAllowance = 10;
	const allocatedEntitlement = customerEntitlements.create({
		entitlementId: `ent_${productId}_seats`,
		featureId: `${productId}_seats`,
		internalFeatureId: `internal_${productId}_seats`,
		featureName: `${productName} Seats`,
		allowance: allocatedAllowance,
		balance: allocatedAllowance - allocatedUsage,
		customerProductId,
		featureConfig: { usage_type: FeatureUsageType.Continuous },
	});

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
		expectedQuantities: {
			fixed: 1,
			prepaid: prepaidQuantity,
			consumable: undefined,
			consumableEntity: 0,
			allocated: allocatedUsage,
		},
	};
};

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

export const setPrepaidStripeProductId = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	stripeProductId: string,
) => {
	product.prepaidPrice.config.stripe_product_id = stripeProductId;
	return product;
};

export const createCustomerPricesWithSuffix = ({
	product,
	customerProductId,
	suffix,
}: {
	product: ReturnType<typeof createProductWithAllPriceTypes>;
	customerProductId: string;
	suffix: string;
}) =>
	createCustomerPricesForProduct({
		prices: product.allPrices,
		customerProductId,
	}).map((customerPrice) => ({
		...customerPrice,
		id: `${customerPrice.id}_${suffix}`,
	}));

export const getStripePriceIds = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	{ isEntityLevel: _isEntityLevel = false }: { isEntityLevel?: boolean } = {},
): string[] => {
	const consumablePriceId = `stripe_${product.product.id}_consumable`;

	return [
		`stripe_${product.product.id}_fixed`,
		`stripe_${product.product.id}_prepaid`,
		consumablePriceId,
		`stripe_${product.product.id}_allocated`,
	];
};

export type ExpectedPhaseItem = {
	price: string;
	quantity: number | undefined;
};

export const getPhaseItemPriceIds = (items: { price?: string }[]): string[] => {
	return items.map((item) => item.price as string).sort();
};

export const expectPhaseItems = (
	items: { price?: string; metadata?: { autumn_price_id?: string } }[],
	expectedPriceIds: string[],
) => {
	const normalizePriceId = (priceId: string) =>
		priceId.startsWith("stripe_") ? priceId.replace("stripe_", "") : priceId;

	const actualPriceIds = items
		.map((item) => item.metadata?.autumn_price_id ?? item.price)
		.filter((priceId): priceId is string => Boolean(priceId))
		.map(normalizePriceId)
		.sort();

	expect(actualPriceIds).toEqual(expectedPriceIds.map(normalizePriceId).sort());
};

export const getExpectedPhaseItems = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	{
		isEntityLevel: _isEntityLevel = false,
		fixedQuantityMultiplier = 1,
	}: { isEntityLevel?: boolean; fixedQuantityMultiplier?: number } = {},
): ExpectedPhaseItem[] => {
	const productId = product.product.id;
	const { expectedQuantities } = product;

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

export type ExpectedSubscriptionItemUpdate = {
	id?: string;
	price?: string;
	quantity?: number;
	deleted?: boolean;
};

export const getExpectedNewProductItems = (
	product: ReturnType<typeof createProductWithAllPriceTypes>,
	{ isEntityLevel: _isEntityLevel = false }: { isEntityLevel?: boolean } = {},
): ExpectedSubscriptionItemUpdate[] => {
	const productId = product.product.id;
	const { expectedQuantities } = product;

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

	if (consumableQuantity === undefined) {
		items.push({ price: consumablePriceId });
	} else {
		items.push({ price: consumablePriceId, quantity: consumableQuantity });
	}

	return items;
};

export const expectSubscriptionItemsUpdate = (
	actual: ExpectedSubscriptionItemUpdate[],
	expected: ExpectedSubscriptionItemUpdate[],
) => {
	const stripMetadata = (item: ExpectedSubscriptionItemUpdate) => ({
		id: item.id,
		price: item.price,
		quantity: item.quantity,
		deleted: item.deleted,
	});

	const sortItems = (
		a: ExpectedSubscriptionItemUpdate,
		b: ExpectedSubscriptionItemUpdate,
	) => {
		if (a.price && b.price) return a.price.localeCompare(b.price);
		if (a.id && b.id) return a.id.localeCompare(b.id);
		return (a.price ?? a.id ?? "").localeCompare(b.price ?? b.id ?? "");
	};

	const actualSorted = actual.map(stripMetadata).sort(sortItems);
	const expectedSorted = expected.map(stripMetadata).sort(sortItems);

	expect(actualSorted).toEqual(expectedSorted);
};

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

	if (includeMetered) {
		items.push({
			id: `${itemIdPrefix}_${productId}_consumable`,
			priceId: `stripe_${productId}_consumable`,
			quantity: 0,
		});
	}

	return items;
};
