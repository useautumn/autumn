import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { FullCusProduct, Price, UsagePriceConfig } from "@autumn/shared";
import { Feature } from "@autumn/shared";
import { FeatureOptions } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";

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
  let newOptionsList: FeatureOptions[] = [];

  for (const options of optionsInput || []) {
    const feature = features.find(
      (feature) => feature.id === options.feature_id
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

    let config = prepaidPrice.config as UsagePriceConfig;

    let dividedQuantity = new Decimal(options.quantity!)
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
  for (const option of curOptionsList) {
    const inNewOptions = newOptionsList.find(
      (newOption) =>
        newOption.internal_feature_id === option.internal_feature_id
    );

    const prepaidPriceExists = findPrepaidPrice({
      prices,
      internalFeatureId: option.internal_feature_id!,
    });

    if (!inNewOptions && prepaidPriceExists) {
      newOptionsList.push(option);
    }
  }

  return newOptionsList;
};
