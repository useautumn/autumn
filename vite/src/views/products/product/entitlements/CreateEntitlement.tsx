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
import { CreateEntitlementSchema, Entitlement, Feature } from "@autumn/shared";
import { CreateFeature } from "@/views/features/CreateFeature";
import { FeatureConfig } from "@/views/features/metered-features/FeatureConfig";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import { getFeature } from "@/utils/product/entitlementUtils";

export const CreateEntitlement = () => {
  const [open, setOpen] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const { features, product, setProduct } = useProductContext();

  // console.log("Entitlement", entitlement);

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(
    getFeature(entitlement?.internal_feature_id, features) || null
  );

  const [showFeatureCreate, setShowFeatureCreate] = useState(false);

  const handleCreateEntitlement = async () => {
    const newEntitlement = CreateEntitlementSchema.parse(entitlement);
    console.log("New entitlement", newEntitlement);

    setProduct({
      ...product,
      entitlements: [...product.entitlements, newEntitlement],
    });

    setOpen(false);
    setEntitlement(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          startIcon={<PlusIcon size={15} />}
          variant="dashed"
          className="w-full"
          onClick={() => {
            setSelectedFeature(null);
            setEntitlement(null);
          }}
        >
          Add Feature
        </Button>
      </DialogTrigger>
      <DialogContent className="translate-y-[0%] top-[20%]">
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
        <div className="flex w-full overflow-hidden">
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
            <div className="w-full flex flex-col gap-4">
              <EntitlementConfig
                entitlement={entitlement}
                setEntitlement={setEntitlement}
                setShowFeatureCreate={setShowFeatureCreate}
                selectedFeature={selectedFeature}
                setSelectedFeature={setSelectedFeature}
              />
              <DialogFooter>
                <Button
                  onClick={handleCreateEntitlement}
                  variant="gradientPrimary"
                >
                  Add to Product
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
