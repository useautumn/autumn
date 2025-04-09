import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Price, UsagePriceConfig } from "@autumn/shared";
import React, { useState } from "react";

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { PricingTypeBadge } from "./PricingTypeBadge";
import UpdatePricing from "./UpdatePricing";
import { useProductContext } from "../ProductContext";
import { getBillingUnits } from "@/utils/product/priceUtils";
import { AdminHover } from "@/components/general/AdminHover";

// import UpdatePricing from "./UpdatePricing";

export const ProductPricingTable = ({ prices }: { prices: Price[] }) => {
  const { org, product } = useProductContext();

  const formatAmount = (config: any, type: string) => {
    const currency = org?.default_currency || "USD";
    if (type === "fixed") {
      // Handle fixed price - show all rates and periods
      const formattedAmount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(config.amount);

      return (
        <React.Fragment>
          {formattedAmount}{" "}
          <span className="text-t3">
            {config.interval === "one_off"
              ? "one off"
              : `per ${config.interval}`}
          </span>
        </React.Fragment>
      );
    } else if (type === "usage") {
      // Handle usage price - just show min and max amounts
      const numUnits = getBillingUnits(config, product.entitlements!);
      const formatUsageAmount = (amount: number) => {
        const currency = org?.default_currency || "USD";
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0, // Allow any number of decimal places
          maximumFractionDigits: 10, // Maximum of 10 decimal places
        }).format(amount);
      };
      if (config.usage_tiers.length > 1) {
        const amounts = config.usage_tiers.map((tier: any) => tier.amount);
        const minAmount = formatUsageAmount(Math.min(...amounts));
        const maxAmount = formatUsageAmount(Math.max(...amounts));

        return (
          <>
            {minAmount} - {maxAmount}{" "}
            <span className="text-t3">per {numUnits} </span>
          </>
        );
      }

      // Single tier - just show the amount
      const amount = formatUsageAmount(config.usage_tiers[0].amount);
      return (
        <>
          {amount} <span className="text-t3">per {numUnits} units</span>
        </>
      );
    }
    return "";
  };
  const [open, setOpen] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<Price | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleRowClick = (price: Price, index: number) => {
    setSelectedPrice(price);
    setSelectedIndex(index);
    setOpen(true);
  };

  return (
    <>
      <UpdatePricing
        open={open}
        setOpen={setOpen}
        selectedPrice={selectedPrice}
        setSelectedPrice={setSelectedPrice}
        selectedIndex={selectedIndex || 0}
      />

      <Table>
        <TableHeader className="rounded-full">
          <TableRow>
            <TableHead className="">Name</TableHead>
            <TableHead className="">Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="for-consistency-w-entitlements"> </TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prices.map((price, index: number) => (
            <TableRow
              // key={`${price.id}-${price.created_at}`}
              key={index}
              className="cursor-pointer"
              onClick={() => handleRowClick(price, index)}
            >
              <TableCell>
                <AdminHover
                  texts={[
                    { key: "ID", value: price.id! },
                    {
                      key: "Internal Feature ID",
                      value:
                        (price.config as UsagePriceConfig)
                          .internal_feature_id || "N/A",
                    },
                    {
                      key: "Stripe Meter ID",
                      value:
                        (price.config as UsagePriceConfig).stripe_meter_id ||
                        "N/A",
                    },
                    {
                      key: "Stripe Price ID",
                      value:
                        (price.config as UsagePriceConfig).stripe_price_id ||
                        "N/A",
                    },
                    {
                      key: "Stripe Product ID",
                      value:
                        (price.config as UsagePriceConfig).stripe_product_id ||
                        "N/A",
                    },
                  ]}
                >
                  {price.name}
                </AdminHover>
              </TableCell>
              <TableCell>
                <PricingTypeBadge type={price.config?.type || ""} />
              </TableCell>
              <TableCell>
                {formatAmount(price.config, price.config?.type || "")}
              </TableCell>
              <TableCell> </TableCell>
              <TableCell className="min-w-20 w-24">
                <span>{formatUnixToDateTime(price.created_at).date}</span>{" "}
                <span className="text-t3">
                  {formatUnixToDateTime(price.created_at).time}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
