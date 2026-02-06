import { InternalError } from "@api/errors/base/InternalError.js";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels";
import type { Feature } from "../../../models/featureModels/featureModels";
import type { Price } from "../../../models/productModels/priceModels/priceModels";

import {
	isFixedPrice,
	isPrepaidPrice,
	priceOnFeature,
} from "../../productUtils/priceUtils/classifyPriceUtils";
import { cusProductToPrices } from "../convertCusProduct";

// Overload: errorOnNotFound = true → guaranteed Price
export function customerProductToBasePrice(params: {
	customerProduct: FullCusProduct;
	errorOnNotFound: true;
}): Price;

// Overload: errorOnNotFound = false/undefined → Price | undefined
export function customerProductToBasePrice(params: {
	customerProduct: FullCusProduct;
	errorOnNotFound?: false;
}): Price | undefined;

// Implementation
export function customerProductToBasePrice({
	customerProduct,
	errorOnNotFound,
}: {
	customerProduct: FullCusProduct;
	errorOnNotFound?: boolean;
}): Price | undefined {
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	const result = prices.find((p) => isFixedPrice(p));

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Base price not found for customer product ${customerProduct.id}`,
		});
	}

	return result;
}

// Overload: errorOnNotFound = true → guaranteed Price
export function customerProductToPrepaidPrice(params: {
	customerProduct: FullCusProduct;
	feature?: Feature;
	errorOnNotFound: true;
}): Price;

// Overload: errorOnNotFound = false/undefined → Price | undefined
export function customerProductToPrepaidPrice(params: {
	customerProduct: FullCusProduct;
	feature?: Feature;
	errorOnNotFound?: false;
}): Price | undefined;

// Implementation
export function customerProductToPrepaidPrice({
	customerProduct,
	feature,
	errorOnNotFound,
}: {
	customerProduct: FullCusProduct;
	feature?: Feature;
	errorOnNotFound?: boolean;
}): Price | undefined {
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	const result = prices.find((p) => {
		const featureMatch = feature
			? priceOnFeature({ price: p, feature })
			: true;
		return isPrepaidPrice(p) && featureMatch;
	});

	if (errorOnNotFound && !result) {
		const featureMsg = feature ? ` for feature ${feature.id}` : "";
		throw new InternalError({
			message: `Prepaid price not found${featureMsg} for customer product ${customerProduct.id}`,
		});
	}

	return result;
}
