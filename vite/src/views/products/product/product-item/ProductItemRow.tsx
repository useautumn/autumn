// ProductItemRow.tsx
import {
  BillingInterval,
  Feature,
  FeatureType,
  getFeatureName,
  Infinite,
  ProductItem,
  ProductItemType,
} from "@autumn/shared";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import {
  formatAmount,
  getItemType,
  intervalIsNone,
} from "@/utils/product/productItemUtils";
import { AdminHover } from "@/components/general/AdminHover";
import { getFeature } from "@/utils/product/entitlementUtils";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFeatureItem, isPriceItem } from "@/utils/product/getItemType";
import { notNullish } from "@/utils/genUtils";
import { useProductContext } from "../ProductContext";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";

interface ProductItemRowProps {
  item: ProductItem;
  index: number;
  isOnboarding: boolean;
  features: Feature[];
  org: any;
  onRowClick: (item: ProductItem, index: number) => void;
  className?: string;
}

export const ProductItemRow = ({
  item,
  index,
  isOnboarding,
  features,
  org,
  onRowClick,
  className,
}: ProductItemRowProps) => {
  const { product } = useProductContext();
  const getName = ({
    featureId,
    units,
  }: {
    featureId: string;
    units: number | string | null | undefined;
  }) => {
    const feature = getFeature(featureId, features);

    if (!feature) return "";

    const plural = units !== 1;
    return getFeatureName({
      feature: feature!,
      plural: plural,
    });
  };

  const getFreeFeatureString = (item: ProductItem) => {
    const feature = features.find((f: Feature) => f.id == item.feature_id);

    const featureName = getName({
      featureId: item.feature_id!,
      units: item.included_usage,
    });

    if (feature?.type === FeatureType.Boolean) {
      return `${featureName}`;
    }

    if (item.included_usage == Infinite) {
      return `Unlimited ${featureName}`;
    }

    let entityFeatureName = "";
    if (item.entity_feature_id) {
      entityFeatureName = getName({
        featureId: item.entity_feature_id!,
        units: 1,
      });
    }

    let intervalStr = "";
    if (
      item.interval_count &&
      item.interval_count > 1 &&
      notNullish(item.interval)
    ) {
      intervalStr = ` ${item.interval_count} ${item.interval}s`;
    } else if (item.interval) {
      intervalStr = ` ${item.interval}`;
    }

    return (
      <div className="whitespace-nowrap flex">
        {item.included_usage ?? 0}&nbsp;
        <span className="truncate">{featureName}</span> &nbsp;
        {item.entity_feature_id && (
          <span className="truncate">per {entityFeatureName} &nbsp;</span>
        )}
        {notNullish(item.interval) && (
          <span className="text-t3">per {intervalStr}</span>
        )}
      </div>
    );
  };

  const getPaidFeatureString = (item: ProductItem) => {
    let amountStr = "";

    if (item.price) {
      amountStr = formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.price,
      });
    } else if (item.tiers && item.tiers.length == 1) {
      amountStr = formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.tiers![0].amount,
      });
    } else {
      amountStr = `${formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.tiers![0].amount,
      })} - ${formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.tiers![item.tiers!.length - 1].amount,
      })}`;
    }

    const feature = features.find((f: Feature) => f.id == item.feature_id);
    const billUnitsFeatureName = getName({
      featureId: item.feature_id!,
      units: item.billing_units,
    });

    amountStr += ` per ${item.billing_units! > 1 ? item.billing_units : ""} ${
      billUnitsFeatureName
    }`;

    const intervalStr = formatIntervalText({
      billingInterval: item.interval as unknown as BillingInterval,
      intervalCount: item.interval_count ?? 1,
    });

    if (!intervalIsNone(item.interval)) {
      amountStr += ` ${intervalStr}`;
    }

    if (item.included_usage) {
      const includedUsageFeatureName = getName({
        featureId: item.feature_id!,
        units: item.included_usage,
      });

      return `${item.included_usage} ${includedUsageFeatureName} free, then ${amountStr}`;
    } else {
      return amountStr;
    }
  };

  const getFixedPriceString = (item: ProductItem) => {
    const currency = org?.default_currency || "USD";
    const formattedAmount = formatAmount({
      defaultCurrency: currency,
      amount: item.price!,
    });

    const intervalStr = formatIntervalText({
      billingInterval: item.interval as unknown as BillingInterval,
      intervalCount: item.interval_count ?? 1,
    });

    if (!intervalIsNone(item.interval)) {
      return `${formattedAmount} ${intervalStr}`;
    }

    return `${formattedAmount}`;
  };

  const getAdminHoverTexts = (item: ProductItem) => {
    if (isFeatureItem(item)) {
      return [
        {
          key: "Entitlement ID",
          value: item.entitlement_id || "N/A",
        },
      ];
    }

    let texts = [
      {
        key: "Price ID",
        value: item.price_id || "N/A",
      },
      {
        key: "Stripe Price ID",
        value: item.price_config?.stripe_price_id || "N/A",
      },
      ...(item.price_config?.stripe_empty_price_id
        ? [
            {
              key: "Stripe Empty Price ID",
              value: item.price_config?.stripe_empty_price_id || "N/A",
            },
          ]
        : []),
    ];

    if (!isPriceItem(item)) {
      texts = texts.concat([
        {
          key: "Entitlement ID",
          value: item.entitlement_id || "N/A",
        },
        {
          key: "Stripe Product ID",
          value: item.price_config?.stripe_product_id || "N/A",
        },
        {
          key: "Stripe Meter ID",
          value: item.price_config?.stripe_meter_id || "N/A",
        },
      ]);
    }

    return texts;
  };

  const itemType = getItemType(item);

  return (
    <div
      key={index}
      className={cn(
        "grid grid-cols-17 gap-4 px-10 text-t2 h-10 items-center hover:bg-primary/3",
        isOnboarding && "grid-cols-12 px-2 h-10 min-h-10",
        className
      )}
      onClick={() => onRowClick(item, index)}
    >
      {!isOnboarding && (
        <span className="col-span-3 overflow-hidden flex whitespace-nowrap  items-center">
          <span className="truncate font-mono text-t3 w-full ">
            {item.feature_id || ""}
          </span>
        </span>
      )}
      <span className="col-span-8 whitespace-nowrap truncate">
        <AdminHover texts={getAdminHoverTexts(item)}>
          {itemType === ProductItemType.Feature
            ? getFreeFeatureString(item)
            : itemType === ProductItemType.Price
              ? getFixedPriceString(item)
              : getPaidFeatureString(item)}
        </AdminHover>
      </span>
      <span
        className={cn(
          "col-span-4 flex gap-1 justify-end w-fit",
          isOnboarding && "w-full"
        )}
      >
        <Badge
          variant="blue"
          className={cn(
            "text-xs flex gap-1 items-center opacity-0",
            (itemType === ProductItemType.Feature ||
              itemType === ProductItemType.FeaturePrice) &&
              "opacity-100"
          )}
        >
          <Flag size={12} /> Feature
        </Badge>

        <Badge
          variant="yellow"
          className={cn(
            "text-xs flex gap-1 items-center opacity-0",
            (itemType === ProductItemType.Price ||
              itemType === ProductItemType.FeaturePrice) &&
              "opacity-100"
          )}
        >
          <DollarSign size={12} /> Price
        </Badge>
      </span>
      {!isOnboarding && (
        <span className="flex text-xs text-t3 items-center col-span-2 whitespace-nowrap justify-end">
          {item.created_at
            ? formatUnixToDateTime(item.created_at).date
            : formatUnixToDateTime(Math.floor(Date.now())).date}
        </span>
      )}
    </div>
  );
};
