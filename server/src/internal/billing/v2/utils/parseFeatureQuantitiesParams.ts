import {
	ErrCode,
	type Feature,
	type FeatureOptions,
	type FullCusProduct,
	nullish,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";

/**
 * Parses and normalizes feature quantity options for billing.
 *
 * Converts raw quantity input to billing units and merges with existing options
 * from the current customer product (for recurring products only).
 *
 * @param optionsInput - Raw feature options with quantities
 * @param features - Available features to validate against
 * @param prices - Product prices to find prepaid price config
 * @param currentCustomerProduct - Existing customer product for merging options
 * @returns Normalized feature options with internal_feature_id and adjusted quantities
 */
export const parseFeatureQuantitiesParams = ({
	optionsInput,
	features,
	prices,
	currentCustomerProduct,
}: {
	optionsInput?: FeatureOptions[];
	features: Feature[];
	prices: Price[];
	currentCustomerProduct?: FullCusProduct;
}): FeatureOptions[] => {
	const parsedOptions = parseAndNormalizeOptions({
		optionsInput,
		features,
		prices,
	});

	if (isOneOff(prices) || isFreeProduct(prices)) {
		return parsedOptions;
	}

	return mergeWithExistingOptions({
		parsedOptions,
		currentCustomerProduct,
		prices,
	});
};

const parseAndNormalizeOptions = ({
	optionsInput,
	features,
	prices,
}: {
	optionsInput?: FeatureOptions[];
	features: Feature[];
	prices: Price[];
}): FeatureOptions[] => {
	const result: FeatureOptions[] = [];

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

		const config = prepaidPrice.config as UsagePriceConfig;
		const billingUnits = config.billing_units || 1;

		if (nullish(options.quantity)) {
			throw new RecaseError({
				message: `Quantity is required for feature ${feature.id}`,
				code: ErrCode.InvalidOptions,
			});
		}

		const normalizedQuantity = new Decimal(options.quantity)
			.div(billingUnits)
			.ceil()
			.toNumber();

		result.push({
			...options,
			internal_feature_id: feature.internal_id,
			quantity: normalizedQuantity,
		});
	}

	return result;
};

const mergeWithExistingOptions = ({
	parsedOptions,
	currentCustomerProduct,
	prices,
}: {
	parsedOptions: FeatureOptions[];
	currentCustomerProduct?: FullCusProduct;
	prices: Price[];
}): FeatureOptions[] => {
	const existingOptions = currentCustomerProduct?.options || [];
	const mergedOptions = [...parsedOptions];

	for (const existingOption of existingOptions) {
		const alreadyIncluded = parsedOptions.some(
			(option) => option.feature_id === existingOption.feature_id,
		);

		if (alreadyIncluded) continue;

		const hasPrepaidPrice = findPrepaidPrice({
			prices,
			internalFeatureId: existingOption.internal_feature_id!,
		});

		if (hasPrepaidPrice) {
			mergedOptions.push(existingOption);
		}
	}

	return mergedOptions;
};
