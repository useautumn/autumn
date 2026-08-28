import type { ProductV2, UsagePriceConfig } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache";
import { PriceService } from "@/internal/products/prices/PriceService";
import {
	createStripeMeteredPriceUnderProduct,
	type FamilySpec,
	getFullProduct,
	requireUsagePrice,
	setupSharedStripeFamilies,
	stampStripeSlotsViaV1Attach,
} from "./sharedStripeProductAutoSyncUtils";

/**
 * "Automations (Overage)" add-on — its only Autumn price is a plain usage
 * price, matched to Stripe purely by stripe_product_id (findKeyedPrice), not
 * by shape. The real-world Stripe price on the customer's sub has a totally
 * different shape (graduated, N included then overage) that Autumn never
 * tries to reproduce.
 */
export const automationsAddon = ({ id }: { id: string }): ProductV2 =>
	products.base({
		id,
		isAddOn: true,
		items: [items.consumableMessages({ price: 0.1 })],
	});

/** Dedicated IPs — prepaid add-on, matched by prepaid price shape (unrelated mechanism). */
export const dedicatedIpsAddon = ({ id }: { id: string }): ProductV2 =>
	products.base({
		id,
		isAddOn: true,
		items: [items.prepaidMessages({ billingUnits: 1, price: 30 })],
	});

/**
 * Native Stripe price simulating the real "Automations" price (graduated,
 * N included then overage) under the add-on's own dedicated Stripe product.
 * Shape is irrelevant to the contract — findKeyedPrice matches by
 * stripe_product_id alone, so a flat metered price is sufficient.
 */
export const createNativeAutomationsPrice = async ({
	ctx,
	addonStripeProductId,
}: {
	ctx: TestContext;
	addonStripeProductId: string;
}): Promise<Stripe.Price> =>
	createStripeMeteredPriceUnderProduct({
		ctx,
		stripeProductId: addonStripeProductId,
		unitAmountDecimal: "50",
	});

/** Native per-unit licensed price, e.g. the original "Dedicated IP $30". */
export const createNativeDedicatedIpPrice = async ({
	ctx,
	addonStripeProductId,
}: {
	ctx: TestContext;
	addonStripeProductId: string;
}): Promise<Stripe.Price> =>
	ctx.stripeCli.prices.create({
		product: addonStripeProductId,
		currency: "usd",
		unit_amount: 3000,
		recurring: { interval: "month" },
	});

/** Price-level stripe_product_id override so findKeyedPrice uniquely claims the add-on. */
const stampDedicatedAutomationsStripeProduct = async ({
	ctx,
	automationsId,
}: {
	ctx: TestContext;
	automationsId: string;
}) => {
	const dedicated = await ctx.stripeCli.products.create({
		name: `Automations keyed ${automationsId}`,
	});
	const fullProduct = await getFullProduct({ ctx, productId: automationsId });
	const price = requireUsagePrice({ fullProduct });
	const config = { ...price.config } as UsagePriceConfig;
	config.stripe_product_id = dedicated.id;
	await PriceService.update({
		db: ctx.db,
		id: price.id!,
		update: { config },
	});
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
};

/** findKeyedPrice matches on the usage price's stripe_product_id, not processor.id. */
export const automationsStripeProductId = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}): Promise<string> => {
	const fullProduct = await getFullProduct({ ctx, productId });
	const stripeProductId = requireUsagePrice({ fullProduct }).config
		.stripe_product_id;
	if (!stripeProductId) {
		throw new Error(`Product ${productId}'s usage price has no Stripe product`);
	}
	return stripeProductId;
};

/** Dedicated IPs' prepaid price reuses the product-level processor.id. */
export const dedicatedIpsStripeProductId = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}): Promise<string> => {
	const fullProduct = await getFullProduct({ ctx, productId });
	const stripeProductId = fullProduct.processor?.id;
	if (!stripeProductId) {
		throw new Error(`Product ${productId} has no mapped Stripe product`);
	}
	return stripeProductId;
};

/**
 * Sets up: a Transactional Pro base+variant family (group "transactional"),
 * optionally a second, unrelated base-only family in a different group (for
 * the multiple-subscriptions case), plus the Automations (Overage) and/or
 * Dedicated IPs add-ons in the same catalog.
 */
export const setupKeyedUsageAddonScenario = async ({
	customerId,
	baseId,
	variantId,
	variantIncluded = 100_000,
	secondGroupBaseId,
	automationsId,
	dedicatedIpsId,
}: {
	customerId: string;
	baseId: string;
	variantId: string;
	variantIncluded?: number;
	secondGroupBaseId?: string;
	automationsId?: string;
	dedicatedIpsId?: string;
}) => {
	const families: FamilySpec[] = [
		{
			baseId,
			group: "transactional",
			baseAmount: 20,
			featureId: TestFeature.Messages,
			baseIncluded: 1_000,
			variants: [{ id: variantId, amount: 35, included: variantIncluded }],
		},
		...(secondGroupBaseId
			? [
					{
						baseId: secondGroupBaseId,
						group: "storage",
						baseAmount: 10,
						featureId: TestFeature.Messages,
						baseIncluded: 500,
						variants: [],
					},
				]
			: []),
	];

	const additionalProducts: ProductV2[] = [
		...(automationsId ? [automationsAddon({ id: automationsId })] : []),
		...(dedicatedIpsId ? [dedicatedIpsAddon({ id: dedicatedIpsId })] : []),
	];

	const stampCustomerId = `${customerId}-v1-stamp`;
	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families,
		additionalProducts,
		stampCustomerId,
	});

	await stampStripeSlotsViaV1Attach({
		autumnV1,
		customerId: stampCustomerId,
		attaches: [
			...families.flatMap((family) =>
				family.variants.length > 0
					? family.variants.map((variant) => ({ productId: variant.id }))
					: [{ productId: family.baseId }],
			),
			...(automationsId ? [{ productId: automationsId }] : []),
			...(dedicatedIpsId
				? [
						{
							productId: dedicatedIpsId,
							options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
						},
					]
				: []),
		],
	});

	if (automationsId) {
		await stampDedicatedAutomationsStripeProduct({ ctx, automationsId });
	}

	for (const productId of fullProducts.keys()) {
		fullProducts.set(productId, await getFullProduct({ ctx, productId }));
	}

	return { autumnV1, ctx, fullProducts };
};
