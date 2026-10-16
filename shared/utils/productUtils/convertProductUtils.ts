import { InternalError } from "@api/errors/base/InternalError.js";
import type { FeatureOptions } from "@models/cusProductModels/cusProductModels.js";
import type {
	Entitlement,
	EntitlementWithFeature,
} from "../../models/productModels/entModels/entModels.js";
import type { FixedPriceConfig } from "../../models/productModels/priceModels/priceConfig/fixedPriceConfig.js";
import type { Price } from "../../models/productModels/priceModels/priceModels.js";
import type {
	FullProduct,
	FullProductWithoutLicenses,
	Product,
} from "../../models/productModels/productModels.js";
import type { EntitlementPrice } from "./entitlementPriceUtils/entitlementPriceTypes.js";
import { isLifetimeEntitlement } from "./entUtils/classifyEntUtils.js";
import { isFixedPrice } from "./priceUtils/classifyPriceUtils.js";

// Must stay symmetric with priceToEnt: if one direction resolves a pair across
// products and the other does not, mapToProductItems silently drops the price.
export const entToPrice = ({
	ent,
	prices,
}: {
	ent: Entitlement;
	prices: Price[];
}) => {
	const idMatches = prices.filter((price) => price.entitlement_id === ent.id);

	return (
		idMatches.find(
			(price) => price.internal_product_id === ent.internal_product_id,
		) ?? idMatches[0]
	);
};

export const productToEntitlementPrices = ({
	product,
}: {
	product: FullProductWithoutLicenses;
}): EntitlementPrice[] => {
	const entitlementPrices: EntitlementPrice[] = [];
	for (const entitlement of product.entitlements) {
		entitlementPrices.push({
			entitlement,
			price: entToPrice({ ent: entitlement, prices: product.prices }),
		});
	}
	return entitlementPrices;
};

export function priceToEnt(params: {
	price: Price;
	entitlements: EntitlementWithFeature[];
	errorOnNotFound: true;
}): EntitlementWithFeature;
export function priceToEnt(params: {
	price: Price;
	entitlements: EntitlementWithFeature[];
	errorOnNotFound?: false;
}): EntitlementWithFeature | undefined;
export function priceToEnt({
	price,
	entitlements,
	errorOnNotFound,
}: {
	price: Price;
	entitlements: EntitlementWithFeature[];
	errorOnNotFound?: boolean;
}): EntitlementWithFeature | undefined {
	// A customer product can carry grandfathered entitlements owned by an older
	// product version while its regenerated custom price is stamped with its own.
	const idMatches = entitlements.filter(
		(ent) => ent.id === price.entitlement_id,
	);
	const entitlement =
		idMatches.find(
			(ent) => ent.internal_product_id === price.internal_product_id,
		) ?? idMatches[0];

	if (!entitlement && errorOnNotFound) {
		throw new InternalError({
			message: `Entitlement not found for price ${price.id}`,
		});
	}

	return entitlement;
}

export const entToOptions = ({
	ent,
	options,
}: {
	ent: Entitlement;
	options: FeatureOptions[];
}) => {
	const matches = options.filter(
		(option) =>
			option.internal_feature_id === ent.internal_feature_id ||
			(ent.feature_id && option.feature_id === ent.feature_id),
	);
	if (matches.length <= 1) return matches[0];

	// Several prepaid slots on one feature: the recurring price owns the caller's
	// quantity, and the one-off top-up beside it stays on its own allowance.
	if (isLifetimeEntitlement({ entitlement: ent })) return undefined;
	return matches.find((option) => option.quantity > 0) ?? matches[0];
};

export const productToStripeId = ({
	product,
}: {
	product: Product | FullProduct;
}): string | null => product.processor?.id ?? null;

/** Primary + alias Stripe product ids (legacy products mapped to this plan). */
export const productToStripeIds = ({
	product,
}: {
	product: Product | FullProduct;
}): string[] => {
	const processor = product.processor;
	if (!processor?.id) return [];
	return [processor.id, ...(processor.additional_ids ?? [])];
};

/** The plan's fixed base price, or null when it has none (e.g. free plans). */
export const productToBasePrice = ({
	product,
}: {
	product: FullProduct;
}): (Price & { config: FixedPriceConfig }) | null =>
	product.prices.find(isFixedPrice) ?? null;

export const productToEnt = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}) => {
	return product.entitlements.find((ent) => ent.feature.id === featureId);
};
