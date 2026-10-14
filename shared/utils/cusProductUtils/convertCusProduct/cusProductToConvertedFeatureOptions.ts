import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type {
	FeatureOptions,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { cusEntsToUsage } from "@utils/cusEntUtils";
import { findCustomerEntitlementByFeature } from "@utils/cusEntUtils/findCustomerEntitlement/findCustomerEntitlementByFeature";
import { cusPriceToCusEnt } from "@utils/cusPriceUtils";
import { findPrepaidCusPriceByFeature } from "@utils/cusPriceUtils/findCusPriceUtils/findPrepaidCusPriceByFeature";
import { nullish } from "@utils/utils";
import { Decimal } from "decimal.js";
import { cusProductToFeatureOptions } from "./cusProductToFeatureOptions";

const usageToConvertedFeatureOptions = ({
	cusProduct,
	entitlement,
	newPrice,
}: {
	cusProduct: FullCusProduct;
	entitlement: EntitlementWithFeature;
	newPrice: Price;
}): FeatureOptions | undefined => {
	const customerEntitlement = findCustomerEntitlementByFeature({
		cusEnts: cusProduct.customer_entitlements,
		feature: entitlement.feature,
	});
	if (!customerEntitlement) return undefined;

	const usage = cusEntsToUsage({
		cusEnts: [
			{
				...customerEntitlement,
				customer_product: cusProduct,
			} satisfies FullCusEntWithFullCusProduct,
		],
	});
	const newAllowance = entitlement.allowance ?? 0;
	const newBillingUnits = newPrice.config.billing_units ?? 1;
	const paidUsage = Math.max(
		0,
		new Decimal(usage).sub(newAllowance).toNumber(),
	);
	const roundedPaidUsage = roundUsageToNearestBillingUnit({
		usage: paidUsage,
		billingUnits: newBillingUnits,
	});

	return {
		internal_feature_id: entitlement.feature.internal_id,
		feature_id: entitlement.feature.id,
		quantity: new Decimal(roundedPaidUsage).div(newBillingUnits).toNumber(),
	};
};

export const cusProductToConvertedFeatureOptions = ({
	cusProduct,
	entitlement,
	newPrice,
}: {
	cusProduct: FullCusProduct;
	entitlement: EntitlementWithFeature;
	newPrice: Price;
}): FeatureOptions | undefined => {
	const feature = entitlement.feature;
	const currentOption = cusProductToFeatureOptions({ cusProduct, feature });

	const oldCusPrice = findPrepaidCusPriceByFeature({
		customerPrices: cusProduct.customer_prices,
		feature,
	});

	if (nullish(currentOption?.quantity) || !oldCusPrice) {
		return usageToConvertedFeatureOptions({
			cusProduct,
			entitlement,
			newPrice,
		});
	}

	const oldCustomerEntitlement = cusPriceToCusEnt({
		cusPrice: oldCusPrice,
		cusEnts: cusProduct.customer_entitlements,
	});

	const oldBillingUnits = oldCusPrice.price.config.billing_units ?? 1;
	const newBillingUnits = newPrice.config.billing_units ?? 1;

	const actualQuantity = new Decimal(currentOption.quantity)
		.mul(oldBillingUnits)
		.toNumber();

	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: actualQuantity,
		billingUnits: newBillingUnits,
	});

	const oldAllowance = oldCustomerEntitlement?.entitlement?.allowance ?? 0;
	const quantityWithOldAllowance = new Decimal(roundedQuantity)
		.add(oldAllowance)
		.toNumber();

	const newAllowance = entitlement.allowance ?? 0;
	const quantityWithoutNewAllowance = Math.max(
		0,
		new Decimal(quantityWithOldAllowance).sub(newAllowance).toNumber(),
	);

	const roundedQuantityWithoutNewAllowance = roundUsageToNearestBillingUnit({
		usage: quantityWithoutNewAllowance,
		billingUnits: newBillingUnits,
	});

	const convertedQuantity = new Decimal(roundedQuantityWithoutNewAllowance)
		.div(newBillingUnits)
		.toNumber();

	const finalQuantity = Math.max(0, convertedQuantity);

	return {
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		quantity: finalQuantity,
	};
};
