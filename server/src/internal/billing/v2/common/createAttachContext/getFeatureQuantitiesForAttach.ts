import {
	type AttachBodyV1,
	type FeatureOptions,
	type FullCustomer,
	isFreeProduct,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { Decimal } from "decimal.js";
import { findPrepaidPrice } from "../../../../products/prices/priceUtils/findPriceUtils";
import { isOneOff } from "../../../../products/productUtils";

// const prepaidPrice = findPrepaidPrice({
// 	prices,
// 	internalFeatureId: feature.internal_id,
// });

// if (!prepaidPrice) {
// 	throw new RecaseError({
// 		message: `No prepaid price found for feature ${feature.id}`,
// 		code: ErrCode.PriceNotFound,
// 	});
// }

export const getFeatureQuantitiesForAttach = async ({
	ctx,
	body,
	prices,
	fullCus,
}: {
	ctx: AutumnContext;
	body: AttachBodyV1;
	prices: Price[];
	fullCus: FullCustomer;
}) => {
	const { features } = ctx;
	const featureQuantities: FeatureOptions[] = [];

	for (const options of body.feature_quantities || []) {
		const feature = features.find(
			(feature) => feature.id === options.feature_id,
		);

		const prepaidPrice = findPrepaidPrice({
			prices,
			internalFeatureId: feature?.internal_id,
		});

		const config = prepaidPrice?.config as UsagePriceConfig;

		const dividedQuantity = new Decimal(options.quantity!)
			.div(config.billing_units || 1)
			.ceil()
			.toNumber();

		featureQuantities.push({
			...options,
			internal_feature_id: feature?.internal_id,
			quantity: dividedQuantity,
		});
	}

	if (isOneOff(prices) || isFreeProduct({ prices })) return featureQuantities;

	// const curOptionsList = fullCus.customer_products.flatMap((product) => product.options);

	// for (const option of curOptionsList) {
	// 	const inNewOptions = newOptionsList.find(
	// 		(newOption) => newOption.feature_id === option.feature_id,
	// 	);

	// 	const prepaidPriceExists = findPrepaidPrice({
	// 		prices,
	// 		internalFeatureId: option.internal_feature_id!,
	// 	});

	// 	if (!inNewOptions && prepaidPriceExists) {
	// 		newOptionsList.push(option);
	// 	}
	// }

	// return newOptionsList;
};
