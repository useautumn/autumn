"use client";

import { useState } from "react";
import {
  PricingDialog,
  PricingDialogButton,
  PricingDialogFooter,
  PricingDialogTitle,
  Information,
} from "@/components/pricing/pricing-dialog";
import { Loader2 } from "lucide-react";

import { getPaywallDialogTexts } from "@/lib/autumn/get-paywall-texts";
import { type CheckFeaturePreview } from "autumn-js";
import { useAutumn } from "autumn-js/react";
import ProductChangeDialog from "./product-change-dialog";

export interface PaywallDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  preview: CheckFeaturePreview;
}

export default function PaywallDialog(params?: PaywallDialogProps) {
  const { attach } = useAutumn();
  const [loading, setLoading] = useState(false);

  if (!params || !params.preview) {
    return <></>;
  }

  const { open, setOpen } = params;
  const { products } = params.preview;
  const { title, message } = getPaywallDialogTexts(params.preview);

  return (
    <PricingDialog open={open} setOpen={setOpen}>
      <PricingDialogTitle>{title}</PricingDialogTitle>
      <Information className="mb-2">{message}</Information>
      <PricingDialogFooter>
        <PricingDialogButton
          size="sm"
          className="font-medium shadow transition min-w-20 text-sm"
          variant="outline"
          onClick={async () => {
            try {
              setLoading(true);
              if (products.length > 0) {
                await attach({
                  productId: products[0].id,
                  dialog: ProductChangeDialog,
                });
              } else {
                window.open("https://useautumn.com", "_blank");
              }
            } catch (error) {
              console.error(error);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}

          {products.length > 0
            ? products[0].is_add_on
              ? `Purchase ${products[0].name}`
              : `Upgrade to ${products[0].name}`
            : "Contact Us"}
        </PricingDialogButton>
      </PricingDialogFooter>
    </PricingDialog>
  );
}
