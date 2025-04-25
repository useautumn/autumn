import RecaseError from "@/utils/errorUtils.js";
import {
  ProductItem,
  EntInterval,
  ErrCode,
  TierInfinite,
  ProductItemSchema,
  Infinite,
  ProductItemInterval,
  Feature,
  FeatureType,
  AppEnv,
  Product,
  ProductItemFeatureType,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { isFeaturePriceItem } from "./productItemUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { isFeatureItem, isPriceItem } from "./getItemType.js";
import { itemToEntInterval } from "./itemIntervalUtils.js";
import { createFeaturesFromItems } from "./createFeaturesFromItems.js";
const validateProductItem = ({
  item,
  features,
}: {
  item: ProductItem;
  features: Feature[];
}) => {
  item = ProductItemSchema.parse(item);

  if (nullish(item.feature_id) && nullish(item.price) && nullish(item.tiers)) {
    throw new RecaseError({
      message: `Either 'feature_id', 'price', or both should be set`,
      code: ErrCode.InvalidProductItem,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // 1. Check if amount and tiers are not null
  if (notNullish(item.price) && notNullish(item.tiers)) {
    throw new RecaseError({
      message: `Either 'price' or 'tiers' should be set, not both`,
      code: ErrCode.InvalidProductItem,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // 2. If amount is set, it must be greater than 0
  if (notNullish(item.price) && item.price! <= 0) {
    throw new RecaseError({
      message: `Price must be greater than 0`,
      code: ErrCode.InvalidProductItem,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // 3. If tiers are set, final tier must be infinite, and amount must be > 0
  if (notNullish(item.tiers)) {
    for (let i = 0; i < item.tiers!.length; i++) {
      let tier = item.tiers![i];
      if (tier.amount < 0) {
        throw new RecaseError({
          message: `Tier amount must be >= 0`,
          code: ErrCode.InvalidProductItem,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (i > 0 && tier.to <= item.tiers![i - 1].to) {
        throw new RecaseError({
          message: `Tier ${i + 1} should have a greater 'to' than tier ${i}`,
          code: ErrCode.InvalidProductItem,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (i == item.tiers!.length - 1 && tier.to != TierInfinite) {
        throw new RecaseError({
          message: `Final tier must be infinite${
            item.feature_id ? ` (feature: ${item.feature_id})` : ""
          }`,
          code: ErrCode.InvalidProductItem,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }
  }

  // 4. If it's a feature item, it should have included usage as number or inf
  if (isFeaturePriceItem(item) || isFeatureItem(item)) {
    if (
      typeof item.included_usage !== "number" &&
      item.included_usage !== Infinite &&
      notNullish(item.included_usage)
    ) {
      throw new RecaseError({
        message: `Included usage must be a number or '${Infinite}'`,
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (nullish(item.included_usage)) {
      item.included_usage = 0;
    }
  }

  // 5. If it's a price, can't have day, minute or hour interval
  if (isFeaturePriceItem(item) || isPriceItem(item)) {
    if (
      item.interval == ProductItemInterval.Day ||
      item.interval == ProductItemInterval.Minute ||
      item.interval == ProductItemInterval.Hour
    ) {
      throw new RecaseError({
        message: `Price can't have day, minute or hour interval`,
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }
};
export const validateProductItems = ({
  newItems,
  features,
  orgId,
  env,
}: {
  newItems: ProductItem[];
  features: Feature[];
  orgId: string;
  env: AppEnv;
}) => {
  let { allFeatures, newFeatures } = createFeaturesFromItems({
    items: newItems,
    curFeatures: features,
    orgId,
    env,
  });

  features = allFeatures;

  // 1. Check values
  for (let index = 0; index < newItems.length; index++) {
    validateProductItem({ item: newItems[index], features });
    let feature = features.find((f) => f.id == newItems[index].feature_id);

    if (feature && feature.type == FeatureType.Metered) {
      newItems[index].feature_type = feature.config?.usage_type;
    }
  }

  for (let index = 0; index < newItems.length; index++) {
    let item = newItems[index];
    let entInterval = itemToEntInterval(item);

    if (isFeaturePriceItem(item) && entInterval == EntInterval.Lifetime) {
      let otherItem = newItems.find((i: any, index2: any) => {
        return i.feature_id == item.feature_id && index2 != index;
      });

      if (otherItem) {
        throw new RecaseError({
          message: `If feature is lifetime and paid, can't have any other features`,
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }

    let otherItem = newItems.find((i: any, index2: any) => {
      return (
        i.feature_id == item.feature_id &&
        index2 != index &&
        itemToEntInterval(i) == entInterval
      );
    });

    // console.log("Item", item);
    // console.log("Ent interval", entInterval);
    // console.log("Other item exists", notNullish(otherItem));

    if (!otherItem) {
      continue;
    }

    if (
      isFeatureItem(otherItem) ||
      item.usage_model == otherItem?.usage_model
    ) {
      throw new RecaseError({
        message: `Can't have two features with same reset interval, unless one is prepaid, and another is pay per use`,
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }

  return { allFeatures, newFeatures };
};
