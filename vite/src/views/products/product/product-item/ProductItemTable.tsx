import {
  Feature,
  FeatureType,
  ProductItem,
  ProductItemInterval,
  ProductItemType,
  UsageUnlimited,
} from "@autumn/shared";
import { useProductContext } from "../ProductContext";
import { CreateProductItem } from "./CreateProductItem";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import {
  formatAmount,
  getItemType,
  intervalIsNone,
  itemIsFixedPrice,
  itemIsFree,
} from "@/utils/product/productItemUtils";
import UpdateProductItem from "./UpdateProductItem";
import { useEffect, useState } from "react";
import { AdminHover } from "@/components/general/AdminHover";
import { getFeature } from "@/utils/product/entitlementUtils";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
export const ProductItemTable = () => {
  let { product, setProduct, features, org } = useProductContext();
  let [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
  let [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  let [open, setOpen] = useState(false);

  const getFreeFeatureString = (item: ProductItem) => {
    const feature = features.find((f: Feature) => f.id == item.feature_id);

    if (feature?.type === FeatureType.Boolean) {
      return `${feature.name}`;
    }

    if (item.included_usage == UsageUnlimited) {
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
        {item.reset_usage_on_billing && (
          <span className="text-t3">per {item.interval}</span>
        )}
      </div>
    );
  };

  const getPaidFeatureString = (item: ProductItem) => {
    let amountStr = "";

    if (item.amount) {
      amountStr = formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.amount,
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
      amount: item.amount!,
    });

    if (!intervalIsNone(item.interval)) {
      return `${formattedAmount} per ${item.interval}`;
    }

    return `${formattedAmount}`;
  };

  let handleRowClick = (item: ProductItem, index: number) => {
    console.log("Item clicked", item);
    setSelectedItem(item);
    setSelectedIndex(index);
    setOpen(true);
  };

  const getAdminHoverTexts = (item: ProductItem) => {
    if (itemIsFree(item)) {
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
      />
      <div className="flex flex-col text-sm rounded-sm">
        <div className="flex items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 pl-10 h-10">
          <h2 className="text-sm text-t2 font-medium col-span-2 flex whitespace-nowrap">
            Product Items
          </h2>
          <div className="flex w-full h-full items-center col-span-8 justify-end">
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
                className="flex grid grid-cols-16 gap-4 px-10 text-t2 h-10 items-center hover:bg-primary/3 pr-4"
                onClick={() => handleRowClick(item, index)}
              >
                <span className="font-mono text-t3 col-span-2 overflow-hidden flex whitespace-nowrap">
                  <AdminHover texts={getAdminHoverTexts(item)}>
                    {item.feature_id || ""}
                  </AdminHover>
                </span>
                <span className="col-span-8 whitespace-nowrap truncate">
                  {itemType === ProductItemType.Feature
                    ? getFreeFeatureString(item)
                    : itemType === ProductItemType.Price
                    ? getFixedPriceString(item)
                    : getPaidFeatureString(item)}
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
                <span className="flex text-xs text-t3 items-center col-span-2 whitespace-nowrap justify-end">
                  {item.created_at
                    ? formatUnixToDateTime(item.created_at).date
                    : formatUnixToDateTime(Math.floor(Date.now())).date}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
