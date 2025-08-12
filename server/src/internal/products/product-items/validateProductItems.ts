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
  OnIncrease,
  UsageModel,
  RolloverDuration,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { notNullish, nullish } from "@/utils/genUtils.js";
import {
  isBooleanFeatureItem,
  isFeatureItem,
  isFeaturePriceItem,
  isPriceItem,
} from "./productItemUtils/getItemType.js";
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

  // 4. One off prices / fixed prices can have at most 2 decimal places
  // (isFeaturePriceItem(item) && !item.interval && isOneOff) ||
  if (isPriceItem(item)) {
    // One off price..., can't have more than 2 DP
    if (item.price && item.price.toString().split(".")[1]?.length > 2) {
      throw new RecaseError({
        message: `One off prices can have at most 2 decimal places`,
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // if (item.tiers) {
    //   item.tiers.forEach((tier) => {
    //     if (tier.amount.toString().split(".")[1]?.length > 2) {
    //       throw new RecaseError({
    //         message: `One off prices can have at most 2 decimal places`,
    //         code: ErrCode.InvalidInputs,
    //         statusCode: StatusCodes.BAD_REQUEST,
    //       });
    //     }
    //   });
    // }
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

  if (
    item.usage_model == UsageModel.Prepaid &&
    item.config?.on_increase == OnIncrease.BillImmediately
  ) {
    throw new RecaseError({
      message: `Bill immediately is not supported for prepaid just yet, contact us at hey@useautumn.com if you're interested!`,
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // Rollover
  // if (item.config?.rollover) {
  //   let rollover = item.config.rollover;

  //   if (rollover.duration == RolloverDuration.Month) {
  //   }
  // }
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

  // const isOneOff =
  //   newItems.every((item) => {
  //     if (isFeatureItem(item)) return true;
  //     return nullish(item.interval);
  //   }) &&
  //   newItems.some((item) => isFeaturePriceItem(item) || isPriceItem(item));

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
    const intervalCount = item.interval_count || 1;

    if (isFeaturePriceItem(item) && entInterval == EntInterval.Lifetime) {
      let otherItem = newItems.find((i: any, index2: any) => {
        return i.feature_id == item.feature_id && index2 != index;
      });

      if (otherItem && isFeaturePriceItem(otherItem)) {
        throw new RecaseError({
          message: `If feature is lifetime and paid, can't have any other features`,
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }

    // Boolean duplicate
    if (isBooleanFeatureItem(item)) {
      let otherItem = newItems.find((i: any, index2: any) => {
        return (
          i.feature_id == item.feature_id &&
          index2 != index &&
          item.entity_feature_id == i.entity_feature_id
        );
      });

      if (otherItem) {
        throw new RecaseError({
          message: `Feature ${item.feature_id} is duplicated`,
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }

    let otherItem = newItems.find((i: any, index2: any) => {
      return (
        i.feature_id == item.feature_id &&
        index2 != index &&
        itemToEntInterval(i) == entInterval &&
        (i.interval_count || 1) == intervalCount &&
        i.entity_feature_id == item.entity_feature_id
      );
    });

    if (!otherItem) {
      continue;
    }

    if (
      isFeatureItem(otherItem) ||
      (item.usage_model && item.usage_model == otherItem?.usage_model)
    ) {
      throw new RecaseError({
        message: `You're trying to add the same feature (${item.feature_id}), with the same reset interval. You should either change the reset interval of one of the items, or make one of them a prepaid quantity`,
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (isPriceItem(item)) {
      let otherItem = newItems.find((i: any, index2: any) => {
        return i.interval === item.interval && index2 != index;
      });

      if (otherItem) {
        throw new RecaseError({
          message: `Can't have two fixed prices with the same interval`,
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }
  }

  return { allFeatures, newFeatures };
};
