import { EntitlementConfig } from "./EntitlementConfig";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useProductContext } from "../ProductContext";
import { getFeature } from "@/utils/product/entitlementUtils";
import { CreatePriceSchema, PriceType } from "@autumn/shared";

export default function UpdateEntitlement({
  open,
  setOpen,
  selectedEntitlement,
  setSelectedEntitlement,
  priceConfig,
  setPriceConfig,
  selectedIndex,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedEntitlement: any;
  setSelectedEntitlement: (entitlement: any) => void;
  priceConfig: any;
  setPriceConfig: (priceConfig: any) => void;
  selectedIndex?: number | null;
}) {
  const { setProduct, product, features } = useProductContext();

  // console.log("prices", product.prices);

  const handleDeleteEntitlement = () => {
    // Remove the entitlement
    const updatedEntitlements = product.entitlements.filter(
      (entitlement: any) => {
        return (
          entitlement?.internal_feature_id !==
          selectedEntitlement?.internal_feature_id
        );
      },
    );

    // Remove any prices associated with this entitlement
    const updatedPrices = product.prices.filter((price: any, index: number) => {
      if (priceConfig.type == PriceType.Fixed) {
        return index !== selectedIndex;
      } else {
        return (
          price.config.internal_feature_id !==
          selectedEntitlement.internal_feature_id
        );
      }
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
        selectedEntitlement?.internal_feature_id
      ) {
        return {
          ...entitlement,
          ...selectedEntitlement,
        };
      }
      return entitlement;
    });

    let updatedPrices;
    // Check if the priceConfig exists in the product.prices array
    const priceExists = product.prices.some(
      (price: any) =>
        price.config.internal_feature_id === priceConfig.internal_feature_id,
    );

    if (!priceExists) {
      // If it doesn't exist, create a new price and add it to updatedPrices
      // console.log("running the right code");
      const newPrice = CreatePriceSchema.parse({
        name: "price",
        config: priceConfig,
      });

      updatedPrices = [...product.prices, newPrice];
    } else if (priceConfig.type == PriceType.Fixed) {
      // map through the product.prices and update the price with the matching selectedIndex
      updatedPrices = product.prices.map((price: any, index: number) => {
        console.log("index", index);
        console.log("selectedIndex", selectedIndex);
        if (index === selectedIndex) {
          return { name: price.name, config: priceConfig };
        }
        return price;
      });
    } else if (priceConfig.usage_tiers.every((tier: any) => tier.amount == 0)) {
      //delete the price
      updatedPrices = product.prices.filter(
        (price: any) =>
          price.config.internal_feature_id !== priceConfig.internal_feature_id,
      );
    } else {
      updatedPrices = product.prices.map((price: any, index: number) => {
        if (
          price.config.internal_feature_id ===
          selectedEntitlement.internal_feature_id
        ) {
          return { name: price.name, config: priceConfig };
        }
        return price;
      });
    }

    console.log("updatedPrices", updatedPrices);
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
            features,
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
