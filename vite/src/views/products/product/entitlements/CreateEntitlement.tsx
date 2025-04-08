import { DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useProductContext } from "../ProductContext";
import { EntitlementConfig } from "./EntitlementConfig";
import {
  CreateEntitlementSchema,
  CreatePriceSchema,
  Entitlement,
  Feature,
  PriceType,
} from "@autumn/shared";
import { CreateFeature } from "@/views/features/CreateFeature";
import { FeatureConfig } from "@/views/features/metered-features/FeatureConfig";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import { getFeature } from "@/utils/product/entitlementUtils";
import { getDefaultPriceConfig } from "@/utils/product/priceUtils";
import { validateConfig } from "../prices/PricingConfig";
import { cn } from "@/lib/utils";

export const CreateEntitlement = ({
  buttonType,
}: {
  buttonType: "feature" | "price";
}) => {
  const [open, setOpen] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [priceConfig, setPriceConfig] = useState<any>(
    getDefaultPriceConfig(PriceType.Usage) // default price config
  );
  const { features, product, setProduct } = useProductContext();

  // console.log("Entitlement", entitlement);

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(
    getFeature(entitlement?.internal_feature_id, features) || null
  );

  const [showFeatureCreate, setShowFeatureCreate] = useState(false);

  const handleCreateEntitlement = async () => {
    const newEntitlement = entitlement
      ? CreateEntitlementSchema.parse(entitlement)
      : null; //as it might just be a fixed price with no entitlement

    // console.log("New entitlement", newEntitlement);
    // console.log("old priceConfig", priceConfig);

    const newPrice = CreatePriceSchema.parse({
      name: "price",
      config: {
        ...priceConfig,
        ...(priceConfig.type === PriceType.Usage && {
          internal_feature_id: selectedFeature?.internal_id,
          feature_id: selectedFeature?.id,
        }),
      },
    });

    // console.log("saving newPrice", newPrice);

    const config = validateConfig(newPrice, product.prices);

    if (!config) {
      console.log("invalid price config");
      return;
    }

    setProduct({
      ...product,
      entitlements: newEntitlement
        ? [...product.entitlements, newEntitlement]
        : product.entitlements,
      prices: [...product.prices, newPrice],
    });

    setOpen(false);
    setEntitlement(null);
    setPriceConfig(getDefaultPriceConfig(PriceType.Usage));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          startIcon={<PlusIcon size={15} />}
          variant={buttonType ? "ghost" : "dashed"}
          className={cn(
            "w-full",
            buttonType && "!w-24 text-primary h-full justify-start"
          )}
          onClick={() => {
            setSelectedFeature(null);
            setEntitlement(null);
            setPriceConfig(getDefaultPriceConfig(PriceType.Usage));
          }}
        >
          {buttonType === "feature" ? "Feature" : "Price"}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn("translate-y-[0%] top-[20%] flex flex-col gap-4 w-fit")}
      >
        <DialogHeader>
          <div className="flex flex-col">
            {showFeatureCreate && (
              <Button
                variant="ghost"
                className="text-xs py-0 px-2 w-fit -ml-5 -mt-7 hover:bg-transparent"
                onClick={() => setShowFeatureCreate(false)}
              >
                ← Product
              </Button>
            )}
            <DialogTitle>Add Feature</DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex overflow-hidden w-fit">
          {showFeatureCreate ? (
            <div className="w-full">
              <CreateFeature
                isFromEntitlement={true}
                setShowFeatureCreate={setShowFeatureCreate}
                setSelectedFeature={setSelectedFeature}
                setOpen={setOpen}
                open={open}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-fit">
              <EntitlementConfig
                entitlement={entitlement}
                setEntitlement={setEntitlement}
                setShowFeatureCreate={setShowFeatureCreate}
                selectedFeature={selectedFeature}
                setSelectedFeature={setSelectedFeature}
                setPriceConfig={setPriceConfig}
                priceConfig={priceConfig}
                handleCreateEntitlement={handleCreateEntitlement}
              />
              {/* <DialogFooter className="w-full flex sm:justify-end mt-4">
                <Button
                  onClick={handleCreateEntitlement}
                  variant="gradientPrimary"
                >
                  Add to Product
                </Button>
              </DialogFooter> */}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
