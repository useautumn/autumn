import type { ProductItem } from "@autumn/shared";
import type { Icon } from "@phosphor-icons/react";
import {
  CheckCircle,
  ArrowsClockwise,
  ArrowClockwise,
  Coins,
  CurrencyDollar,
  XCircle
} from "@phosphor-icons/react";
import {
  ProductItemFeatureType,
  UsageModel
} from "@autumn/shared";

interface PlanFeatureIconProps {
  item: ProductItem;
  position: "left" | "right";
}

// Helper function to classify feature type
const getFeatureType = (item: ProductItem): ProductItemFeatureType | null => {
  return item.feature_type || null;
};

// Helper function to classify billing/usage type
const getBillingType = (item: ProductItem): "included" | "prepaid" | "paid" | "none" => {
  // Check if it's included/free (no price and no usage model)
  if (!item.price && !item.usage_model && !item.price_config) {
    return "included";
  }

  // Check for prepaid model
  if (item.usage_model === UsageModel.Prepaid) {
    return "prepaid";
  }

  // Check for paid model
  if (item.usage_model === UsageModel.PayPerUse || item.price || item.price_config) {
    return "paid";
  }

  return "none";
};

// Helper function to get the left icon (feature type)
const getLeftIcon = (item: ProductItem): { icon: Icon; color: string } => {
  const featureType = getFeatureType(item);

  switch (featureType) {
    case ProductItemFeatureType.Boolean:
      return { icon: CheckCircle, color: "text-[#DE1779]" }; // On/Off - pink
    case ProductItemFeatureType.SingleUse:
      return { icon: ArrowsClockwise, color: "text-[#DE1779]" }; // Usage-based - pink
    case ProductItemFeatureType.ContinuousUse:
      return { icon: ArrowClockwise, color: "text-[#DE1779]" }; // Persistent Usage - pink
    case ProductItemFeatureType.Static:
      return { icon: CheckCircle, color: "text-[#DE1779]" }; // Static - pink
    default:
      return { icon: CheckCircle, color: "text-[#DE1779]" }; // Default - pink
  }
};

// Helper function to get the right icon (billing type)
const getRightIcon = (item: ProductItem): { icon: Icon; color: string } => {
  const billingType = getBillingType(item);

  switch (billingType) {
    case "included":
      return { icon: CheckCircle, color: "text-[#10B981]" }; // Included/Free - green
    case "prepaid":
      return { icon: Coins, color: "text-[#3B82F6]" }; // Prepaid - blue
    case "paid":
      return { icon: CurrencyDollar, color: "text-[#F59E0B]" }; // Paid - orange
    case "none":
      return { icon: XCircle, color: "text-[#6B7280]" }; // None - gray
    default:
      return { icon: XCircle, color: "text-[#6B7280]" }; // Default - gray
  }
};

export const PlanFeatureIcon = ({ item, position }: PlanFeatureIconProps) => {
  const iconData = position === "left" ? getLeftIcon(item) : getRightIcon(item);
  const Icon = iconData.icon;

  return (
    <Icon
      size={16}
      className={iconData.color}
      weight={position === "left" ? "bold" : "regular"}
    />
  );
};