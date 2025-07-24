import { invalidNumber, notNullish } from "@/utils/genUtils";
import { Feature, FeatureUsageType, ProductItem, ProductItemInterval, UsageModel } from "@autumn/shared";
import { toast } from "sonner";
import { isFeatureItem, isFeaturePriceItem } from "../getItemType";
import { isOneOffProduct } from "../priceUtils";

export const validateProductItem = ({
  item,
  // show,
  features,
}: {
  item: ProductItem;
  // show: any;
  features: Feature[];
}) => {
  const feature = features.find((f) => f.id == item.feature_id);

  if (
    feature &&
    feature.config?.usage_type == FeatureUsageType.Continuous &&
    isFeatureItem(item)
  ) {
    item.interval = null;
  }

  if (notNullish(item.price)) {
    if (invalidNumber(item.price)) {
      toast.error("Please enter a valid price amount");
      return null;
    }
    item.price = parseFloat(item.price!.toString());
  }

  if ((item.included_usage as any) === "") {
    item.included_usage = null;
  } else if (!invalidNumber(item.included_usage)) {
    item.included_usage = Number(item.included_usage);
  }

  //if both item.tiers and item.price are set, set item.price to null
  if (item.tiers && item.price) {
    item.price = null;
  }

  // Usage/Feature item validation (when tiers are set)
  if (item.tiers) {
    let previousTo = 0;

    for (let i = 0; i < item.tiers.length; i++) {
      const tier = item.tiers[i];

      // Check if amount is actually a number
      if (typeof tier.amount !== "number") {
        tier.amount = parseFloat(tier.amount);
      }

      // Check if amount is valid
      if (invalidNumber(tier.amount)) {
        toast.error("Please enter valid prices for all tiers");
        return null;
      }

      // Check if amount is negative
      if (tier.amount < 0) {
        toast.error("Please set a positive usage price");
        return null;
      }

      // Skip other validations if 'to' is "inf"
      if (tier.to === "inf") {
        continue;
      }

      tier.to = Number(tier.to);

      // Check if 'to' is a number and valid
      if (typeof tier.to !== "number" || invalidNumber(tier.to)) {
        toast.error("Please enter valid usage limits for all tiers");
        return null;
      }

      // Ensure tiers are in ascending order
      if (tier.to <= previousTo) {
        toast.error("Tiers must be in ascending order");
        return null;
      }

      previousTo = tier.to;
    }
  }

  // Validate billing units
  if (item.billing_units && invalidNumber(item.billing_units)) {
    toast.error("Please enter valid billing units");
    return null;
  } else {
    if (isFeaturePriceItem(item)) {
      item.billing_units = Number(item.billing_units);
    } else {
      item.billing_units = undefined;
    }
  }

  if (item.config) {
    if (item.config.rollover) {
      if(item.interval === null) {
        toast.warning("Cannot create rollover config for a one off product - disabling rollovers");
        item.config.rollover = undefined;
        return item;
      }

      if (invalidNumber(item.config.rollover.max)) {
        toast.error("Please enter a valid maximum rollover amount");
        item.config.rollover = undefined;
        return null;
      }

      if (invalidNumber(item.config.rollover.length)) {
        toast.error("Please enter a valid rollover duration");
        item.config.rollover = undefined;
        return null;
      }

      if(item.config.rollover.duration != ProductItemInterval.Month) {
        toast.error("Rollovers currently only support monthly cycles.");
        item.config.rollover = undefined;
        return null;
      }

      if (item.config.rollover.max < 0 || !item.config.rollover.max) {
        toast.error("Please enter a positive rollover max amount");
        item.config.rollover = undefined;
        return null;
      }

      if (item.config.rollover.length < 0 || !item.config.rollover.length) {
        toast.error("Please enter a positive rollover length");
        item.config.rollover = undefined;
        return null;
      }

      if(item.entity_feature_id && item.usage_model === UsageModel.Prepaid) {
        toast.error("Prepaid products cannot have entity features");
        item.config.rollover = undefined;
        return null;
      }
    }
  }

  return item;
};
