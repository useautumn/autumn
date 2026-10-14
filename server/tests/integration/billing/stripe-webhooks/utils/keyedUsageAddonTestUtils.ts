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
} from "./sharedStripeProductAutoSyncUtils";

export const automationsAddon = ({ id }: { id: string }): ProductV2 =>
	products.base({
		id,
		isAddOn: true,
		items: [items.consumableMessages({ price: 0.1 })],
	});

export const dedicatedIpsAddon = ({ id }: { id: string }): ProductV2 =>
	products.base({
		id,
		isAddOn: true,
		items: [items.prepaidMessages({ billingUnits: 1, price: 30 })],
	});

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

	const { autumnV1, ctx, fullProducts } = await setupSharedStripeFamilies({
		customerId,
		families,
		additionalProducts,
	});

	if (automationsId) {
		await stampDedicatedAutomationsStripeProduct({ ctx, automationsId });
	}

	for (const productId of fullProducts.keys()) {
		fullProducts.set(productId, await getFullProduct({ ctx, productId }));
	}

	return { autumnV1, ctx, fullProducts };
};
