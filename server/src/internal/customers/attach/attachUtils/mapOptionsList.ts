import {
	ErrCode,
	type Feature,
	type FeatureOptions,
	type FullCusProduct,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";

export const mapOptionsList = ({
	optionsInput,
	features,
	prices,
	curCusProduct,
}: {
	optionsInput?: FeatureOptions[]; // options input
	features: Feature[];
	prices: Price[];
	curCusProduct?: FullCusProduct;
}) => {
	const newOptionsList: FeatureOptions[] = [];

	for (const options of optionsInput || []) {
		const feature = features.find(
			(feature) => feature.id === options.feature_id,
		);

		if (!feature) {
			throw new RecaseError({
				message: `Feature ${options.feature_id} passed into options but not found`,
				code: ErrCode.FeatureNotFound,
			});
		}

		const prepaidPrice = findPrepaidPrice({
			prices,
			internalFeatureId: feature.internal_id,
		});

		if (!prepaidPrice) {
			throw new RecaseError({
				message: `No prepaid price found for feature ${feature.id}`,
				code: ErrCode.PriceNotFound,
			});
		}

		// const ent = getPriceEntitlement(prepaidPrice, entitlements)

		const config = prepaidPrice.config as UsagePriceConfig;

		const dividedQuantity = new Decimal(options.quantity!)
			.div(config.billing_units || 1)
			.ceil()
			.toNumber();

		newOptionsList.push({
			...options,
			internal_feature_id: feature.internal_id,
			quantity: dividedQuantity,
		});
	}

	// If product is one off, return
	if (isOneOff(prices) || isFreeProduct(prices)) return newOptionsList;

	const curOptionsList = curCusProduct?.options || [];
	console.log("Current options list:", curOptionsList);
	for (const option of curOptionsList) {
		const inNewOptions = newOptionsList.find(
			(newOption) => newOption.feature_id === option.feature_id,
		);

		const prepaidPriceExists = findPrepaidPrice({
			prices,
			internalFeatureId: option.internal_feature_id!,
		});

		if (!inNewOptions && prepaidPriceExists) {
			newOptionsList.push(option);
		}
	}

	console.log(`New options list:`, newOptionsList);

	return newOptionsList;
};
