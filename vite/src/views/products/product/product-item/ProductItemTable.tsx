import {
  Feature,
  FeatureType,
  Infinite,
  ProductItem,
  ProductItemType,
} from "@autumn/shared";
import { useProductContext } from "../ProductContext";
import { CreateProductItem } from "./CreateProductItem";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import {
  formatAmount,
  getItemType,
  intervalIsNone,
  itemIsFixedPrice,
} from "@/utils/product/productItemUtils";
import UpdateProductItem from "./UpdateProductItem";
import { useEffect, useState } from "react";
import { AdminHover } from "@/components/general/AdminHover";
import { getFeature } from "@/utils/product/entitlementUtils";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFeatureItem } from "@/utils/product/getItemType";
import { notNullish } from "@/utils/genUtils";

export const ProductItemTable = ({
  isOnboarding = false,
}: {
  isOnboarding?: boolean;
}) => {
  let { product, setProduct, features, org } = useProductContext();
  let [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
  let [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  let [open, setOpen] = useState(false);
  const getFreeFeatureString = (item: ProductItem) => {
    const feature = features.find((f: Feature) => f.id == item.feature_id);

    if (feature?.type === FeatureType.Boolean) {
      return `${feature.name}`;
    }

    if (item.included_usage == Infinite) {
      return `Unlimited ${feature?.name}`;
    }

    return (
      <div className="whitespace-nowrap flex">
        {item.included_usage ?? 0}&nbsp;
        <span className="truncate">{feature?.name}</span> &nbsp;
        {item.entity_feature_id && (
          <span className="truncate">
            per {getFeature(item.entity_feature_id, features)?.name} &nbsp;
          </span>
        )}
        {notNullish(item.interval) && (
          <span className="text-t3">per {item.interval}</span>
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

    let feature = features.find((f: Feature) => f.id == item.feature_id);

    amountStr += ` per ${item.billing_units! > 1 ? item.billing_units : ""} ${
      feature?.name
    }`;

    if (!intervalIsNone(item.interval)) {
      amountStr += ` per ${item.interval}`;
    }

    if (item.included_usage) {
      return `${item.included_usage} ${feature?.name} free, then ${amountStr}`;
    } else {
      return amountStr;
    }
  };

  const getFixedPriceString = (item: ProductItem) => {
    let currency = org?.default_currency || "USD";
    let formattedAmount = formatAmount({
      defaultCurrency: currency,
      amount: item.price!,
    });

    if (!intervalIsNone(item.interval)) {
      return `${formattedAmount} per ${item.interval}`;
    }

    return `${formattedAmount}`;
  };

  let handleRowClick = (item: ProductItem, index: number) => {
    setSelectedItem(item);
    setSelectedIndex(index);
    setOpen(true);
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
    ];

    if (!itemIsFixedPrice(item)) {
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
  return (
    <>
      <UpdateProductItem
        selectedItem={selectedItem}
        selectedIndex={selectedIndex}
        setSelectedItem={setSelectedItem}
        open={open}
        setOpen={setOpen}
      />
      <div className="flex flex-col text-sm rounded-sm">
        <div
          className={cn(
            "flex items-center justify-between border-y bg-stone-100 pl-10 pr-10 h-10",
            isOnboarding && "pl-2 pr-2 border-x"
          )}
        >
          <h2 className="text-sm text-t2 font-medium  flex whitespace-nowrap">
            Product Items
          </h2>
          <div className="flex w-full h-full items-center justify-end">
            <div className="flex w-fit h-full items-center">
              <CreateProductItem />
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          {product.items.map((item: ProductItem, index: number) => {
            let itemType = getItemType(item);

            return (
              <div
                key={index}
                className={cn(
                  "flex grid grid-cols-17 gap-4 px-10 text-t2 h-10 items-center hover:bg-primary/3",
                  isOnboarding && "grid-cols-12 px-2"
                )}
                onClick={() => handleRowClick(item, index)}
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
                <span className="col-span-4 flex gap-1 justify-end w-fit ">
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
          })}
        </div>
      </div>
    </>
  );
};
