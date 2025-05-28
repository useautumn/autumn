"use client";
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  PricingDialog,
  PricingDialogTitle,
  Information,
  PriceItem,
  QuantityInput,
  PricingDialogFooter,
  TotalPrice,
  PricingDialogButton,
} from "@/components/pricing/pricing-dialog";

import { getProductChangeTexts } from "@/lib/autumn/get-product-change-texts";
import { type CheckProductPreview } from "autumn-js";
import { useAutumn } from "autumn-js/react";

export interface ProductChangeDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  preview: CheckProductPreview;
  onClick: (options?: any) => Promise<void>;
}

export default function ProductChangeDialog(params?: ProductChangeDialogProps) {
  const { attach } = useAutumn();
  const [loading, setLoading] = useState(false);
  const [prepaidTotals, setPrepaidTotals] = useState(0);
  const [optionsInput, setOptionsInput] = useState<
    {
      feature_id: string;
      feature_name: string;
      billing_units: number;
      price?: number;
      quantity?: number;
    }[]
  >(params?.preview?.options || []);

  useEffect(() => {
    let sum = 0;
    optionsInput.forEach((option) => {
      if (option.price && option.quantity) {
        sum += option.price * option.quantity;
      }
    });
    setPrepaidTotals(sum);
  }, [optionsInput]);

  useEffect(() => {
    setOptionsInput(params?.preview?.options || []);
  }, [params?.preview?.options]);

  if (!params || !params.preview) {
    return <></>;
  }

  const { open, setOpen, preview } = params;
  const { items, due_today, error_on_attach } = preview;
  const { title, message } = getProductChangeTexts(preview);

  return (
    <PricingDialog open={open} setOpen={setOpen}>
      <PricingDialogTitle>{title}</PricingDialogTitle>
      <Information>{message}</Information>
      {items &&
        items.length > 0 &&
        items.map((item) => {
          const { description, price } = item;
          return (
            <PriceItem key={description}>
              <span>{description}</span>
              <span>{price}</span>
            </PriceItem>
          );
        })}

      {optionsInput.length > 0 &&
        optionsInput.map((option, index) => {
          const { feature_name, billing_units, quantity, price } = option;
          return (
            <PriceItem key={feature_name}>
              <span>{feature_name}</span>
              <QuantityInput
                key={feature_name}
                value={quantity ? quantity / billing_units : ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const newOptions = [...optionsInput];
                  newOptions[index].quantity =
                    parseInt(e.target.value) * billing_units;
                  setOptionsInput(newOptions);
                }}
              >
                <span className="text-muted-foreground">
                  × ${price} per {billing_units === 1 ? " " : billing_units}{" "}
                  {feature_name}
                </span>
              </QuantityInput>
            </PriceItem>
          );
        })}

      <PricingDialogFooter>
        {due_today && (
          <TotalPrice>
            <span>Due Today</span>
            <span>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: due_today.currency,
              }).format(due_today.price + prepaidTotals)}
            </span>
          </TotalPrice>
        )}
        <PricingDialogButton
          size="sm"
          variant="outline"
          onClick={async () => {
            setLoading(true);
            try {
              if (!error_on_attach) {
                await attach({
                  productId: preview.product_id,
                  options: optionsInput.map((option) => ({
                    featureId: option.feature_id,
                    quantity: option.quantity || 0,
                  })),
                });
              }
              setOpen(false);
            } catch (error) {
              console.error(error);
            }
            setLoading(false);
          }}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
        </PricingDialogButton>
      </PricingDialogFooter>
    </PricingDialog>
  );
}
