import { Button } from "@/components/ui/button";
import { EntitlementConfig } from "./EntitlementConfig";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useProductContext } from "../ProductContext";
import { toast } from "sonner";
import { getFeature } from "@/utils/product/entitlementUtils";
import { useEffect, useState } from "react";
import { getDefaultPriceConfig } from "@/utils/product/priceUtils";
import { PriceType } from "@autumn/shared";

export default function UpdateEntitlement({
  open,
  setOpen,
  selectedEntitlement,
  setSelectedEntitlement,
  priceConfig,
  setPriceConfig,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedEntitlement: any;
  setSelectedEntitlement: (entitlement: any) => void;
  priceConfig: any;
  setPriceConfig: (priceConfig: any) => void;
}) {
  const { setProduct, product, features } = useProductContext();

  const handleDeleteEntitlement = () => {
    // Remove the entitlement
    const updatedEntitlements = product.entitlements.filter(
      (entitlement: any) => {
        return (
          entitlement.internal_feature_id !==
          selectedEntitlement.internal_feature_id
        );
      }
    );

    // Remove any prices associated with this entitlement
    const updatedPrices = product.prices.filter((price: any) => {
      return (
        price.config.internal_feature_id !==
        selectedEntitlement.internal_feature_id
      );
    });

    setProduct({
      ...product,
      entitlements: updatedEntitlements,
      prices: updatedPrices,
    });

    setOpen(false);
  };

  const handleUpdateEntitlement = () => {
    const updatedEntitlements = product.entitlements.map((entitlement: any) => {
      if (
        entitlement.internal_feature_id ===
        selectedEntitlement.internal_feature_id
      ) {
        return {
          ...entitlement,
          ...selectedEntitlement,
        };
      }
      return entitlement;
    });

    const updatedPrices = product.prices.map((price: any) => {
      if (
        price.config.internal_feature_id ===
        selectedEntitlement.internal_feature_id
      ) {
        return { name: price.name, config: priceConfig };
      }
      return price;
    });

    setProduct({
      ...product,
      entitlements: updatedEntitlements,
      prices: updatedPrices,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogTitle>Update Feature</DialogTitle>
        <EntitlementConfig
          entitlement={selectedEntitlement}
          setEntitlement={setSelectedEntitlement}
          isUpdate={true}
          setShowFeatureCreate={() => {}}
          selectedFeature={getFeature(
            selectedEntitlement?.internal_feature_id,
            features
          )}
          setSelectedFeature={() => {}}
          priceConfig={priceConfig}
          setPriceConfig={setPriceConfig}
          handleUpdateEntitlement={handleUpdateEntitlement}
          handleDeleteEntitlement={handleDeleteEntitlement}
        />

        {/* <DialogFooter className="w-full flex sm:justify-end mt-4">
          <Button onClick={handleUpdateEntitlement} variant="gradientPrimary">
            Update Feature
          </Button>
          <Button variant="destructive" onClick={handleDeleteEntitlement}>
            Delete
          </Button>
        </DialogFooter> */}
      </DialogContent>
    </Dialog>
  );
}
