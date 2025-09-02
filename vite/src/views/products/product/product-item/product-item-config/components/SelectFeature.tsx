import {
  CustomDialogBody,
  CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { DialogHeader } from "@/components/ui/dialog";
import { useProductContext } from "@/views/products/product/ProductContext";
import { Feature, FeatureType } from "@autumn/shared";
import { useProductItemContext } from "../../ProductItemContext";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { FeatureTypeBadge } from "@/views/products/features/components/FeatureTypeBadge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import { CreateItemStep } from "../../utils/CreateItemStep";

export const SelectFeatureStep = ({
  popStep,
  pushStep,
}: {
  popStep: () => void;
  pushStep: (step: CreateItemStep) => void;
}) => {
  const { features } = useProductContext();
  const { item } = useProductItemContext();

  return (
    <>
      <CustomDialogBody>
        <DialogHeader>Select a feature</DialogHeader>
        <div className="flex flex-col gap-2 w-md bg-white border">
          {features
            .filter((feature: Feature) => {
              if (isFeaturePriceItem(item)) {
                return feature.type !== FeatureType.Boolean;
              }
              return true;
            })
            .map((feature: Feature, index: number) => (
              <div
                key={index}
                className="flex gap-4 items-center text-t2 text-sm cursor-pointer hover:bg-stone-200 h-9 px-2 w-full"
                onClick={() => {
                  // setItem({ ...item, feature_id: feature.id! });
                }}
              >
                <span className="truncate">{feature.name}</span>
                <FeatureTypeBadge {...feature} />
              </div>
            ))}
        </div>
        <div className="flex flex-col gap-2 w-md">
          <Button
            variant="dashed"
            className="w-full"
            startIcon={<Plus size={14} />}
            onClick={() => {
              pushStep(CreateItemStep.CreateFeature);
            }}
          >
            Create new feature
          </Button>
        </div>
      </CustomDialogBody>
      <CustomDialogFooter>
        <Button
          variant="dialogBack"
          onClick={() => {
            popStep();
          }}
        >
          <ArrowLeft size={14} />
          Back
        </Button>
      </CustomDialogFooter>
    </>
  );
};
