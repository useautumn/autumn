"use client";
import React from "react";
import { useAutumnContext } from "../providers/AutumnContext";
import { useCustomSwr } from "../hooks/useCustomSwr";
import { cn } from "../../lib/utils";

// use react swr

interface PricingPageProps {
  className?: string;
}

export default function PricingPage({ className }: PricingPageProps) {
  const { data, error, isLoading } = useCustomSwr({
    url: "https://api.useautumn.com/public/products",
  });

  // if (isLoading) return <div>Loading...</div>;
  // if (error) return <div>Error: {error.message}</div>;

  console.log(data);

  return (
    <div
      className={cn("border rounded-md p-4 bg-fuchsia-500", className)}
      // className="border rounded p-4 bg-rose-400 border-blue-300"
    >
      {data?.map((product: any) => (
        <PricingCard key={product.id} product={product} />
      ))}
    </div>
  );
}

const PricingCard = ({ product }: { product: any }) => {
  // 1. Fixed prices
  const fixedPrices = product.fixed_prices;
  const entitlements = product.entitlements;
  return (
    <div className="border rounded-md p-4 bg-fuchsia-500">
      <div>{product.name}</div>
      <div>{product.description}</div>
      {fixedPrices.map((price: any) => (
        <div key={price.id}>
          {price.config.amount} / {price.config.interval}
        </div>
      ))}
      {entitlements.map((entitlement: any) => (
        <div key={entitlement.id}>
          {entitlement.feature.name}
          {entitlement.price && <div>{entitlement.price.bill_when}</div>}
        </div>
      ))}
    </div>
  );
};
