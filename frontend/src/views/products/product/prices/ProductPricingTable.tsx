import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { Price } from "@autumn/shared";
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
import { formatCurrency } from "@/utils/formatUtils/formatTextUtils";
import UpdatePricing from "./UpdatePricing";
import { useProductContext } from "../ProductContext";

// import UpdatePricing from "./UpdatePricing";

export const ProductPricingTable = ({ prices }: { prices: Price[] }) => {
  const { org } = useProductContext();

  const formatAmount = (config: any, type: string) => {
    const currency = org.default_currency || "USD";
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
      if (config.usage_tiers.length > 1) {
        const amounts = config.usage_tiers.map((tier) => tier.amount);
        const minAmount = formatCurrency(Math.min(...amounts));
        const maxAmount = formatCurrency(Math.max(...amounts));

        return (
          <>
            {minAmount} - {maxAmount}{" "}
            <span className="text-t3">per {config.billing_units} units</span>
          </>
        );
      }

      // Single tier - just show the amount
      const amount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(config.usage_tiers[0].amount);
      return (
        <>
          {amount}{" "}
          <span className="text-t3">per {config.billing_units} units</span>
        </>
      );
    }
    return "";
  };
  const [open, setOpen] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<Price | null>(null);

  const handleRowClick = (price: Price) => {
    setSelectedPrice(price);
    setOpen(true);
  };

  return (
    <>
      <UpdatePricing
        open={open}
        setOpen={setOpen}
        selectedPrice={selectedPrice}
        setSelectedPrice={setSelectedPrice}
      />

      <Table>
        <TableHeader className="rounded-full">
          <TableRow>
            <TableHead className="">Name</TableHead>
            <TableHead className="">Price ID</TableHead>
            <TableHead className="">Type</TableHead>
            <TableHead>Amount</TableHead>

            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prices.map((price, index: number) => (
            <TableRow
              // key={`${price.id}-${price.created_at}`}
              key={index}
              className="cursor-pointer"
              onClick={() => handleRowClick(price)}
            >
              <TableCell className="min-w-32 font-medium">
                {price.name}
              </TableCell>
              <TableCell className="min-w-72 font-mono text-t2">
                <div>{price.id}</div>
              </TableCell>
              <TableCell className="min-w-32">
                <PricingTypeBadge type={price.config?.type || ""} />
              </TableCell>
              <TableCell className="min-w-32 w-full">
                {formatAmount(price.config, price.config?.type || "")}
              </TableCell>
              <TableCell className="min-w-48">
                {formatUnixToDateTimeString(price.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
