import RecaseError from "@/utils/errorUtils.js";
import {
  ProductItem,
  EntInterval,
  ErrCode,
  TierInfinite,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
  itemToEntInterval,
  isFeaturePriceItem,
  itemIsFree,
} from "./productItemUtils.js";
import { notNullish } from "@/utils/genUtils.js";

const validateProductItem = ({ item }: { item: ProductItem }) => {
  // 1. Check if amount and tiers are not null
  if (notNullish(item.amount) && notNullish(item.tiers)) {
    throw new RecaseError({
      message: `Either 'amount' or 'tiers' should be set, not both`,
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // 2. If amount is set, it must be greater than 0
  if (notNullish(item.amount) && item.amount! <= 0) {
    throw new RecaseError({
      message: `Amount must be greater than 0`,
      code: ErrCode.InvalidInputs,
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
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (i > 0 && tier.to <= item.tiers![i - 1].to) {
        throw new RecaseError({
          message: `Tier ${i + 1} should have a greater 'to' than tier ${i}`,
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (i == item.tiers!.length - 1 && tier.to != TierInfinite) {
        throw new RecaseError({
          message: `Final tier must be infinite${
            item.feature_id ? ` (feature: ${item.feature_id})` : ""
          }`,
          code: ErrCode.InvalidInputs,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }
    }
  }
};

export const validateProductItems = ({
  newItems,
}: {
  newItems: ProductItem[];
}) => {
  // 1. Check values
  for (let index = 0; index < newItems.length; index++) {
    validateProductItem({ item: newItems[index] });
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

    if (itemIsFree(otherItem) || item.behavior == otherItem?.behavior) {
      throw new RecaseError({
        message: `Can't have two features with same reset interval, unless one is prepaid, and another is pay per use`,
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }
};
