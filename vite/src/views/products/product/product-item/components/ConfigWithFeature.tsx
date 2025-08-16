import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectItemFeature } from "./SelectItemFeature";
import { useProductItemContext } from "../ProductItemContext";
import { useProductContext } from "../../ProductContext";
import { FeatureType } from "@autumn/shared";
import { getFeature } from "@/utils/product/entitlementUtils";
import { FeatureConfig } from "../product-item-config/FeatureItemConfig";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isFeatureItem, isFeaturePriceItem } from "@/utils/product/getItemType";
import { itemsHaveSameInterval } from "@/utils/product/productItemUtils";
import { toast } from "sonner";

export const ConfigWithFeature = () => {
  const { features, product, setProduct } = useProductContext();
  const { item, isUpdate, setOpen, warning } = useProductItemContext();

  const isBooleanFeature =
    getFeature(item.feature_id, features)?.type === FeatureType.Boolean;

  const otherItemIndex = product.items.findIndex(
    (i: any) =>
      i.feature_id === item.feature_id &&
      isFeaturePriceItem(i) &&
      itemsHaveSameInterval({ item1: i, item2: item })
  );

  const handleAddToExistingItem = () => {
    const newItems = [...product.items];
    const newIncludedUsage = parseFloat(item.included_usage);
    if (!item.included_usage || isNaN(newIncludedUsage)) {
      toast.error("You must set an included usage for this item");
      return;
    }
    newItems[otherItemIndex] = {
      ...newItems[otherItemIndex],
      included_usage: newIncludedUsage,
    };

    setProduct({ ...product, items: newItems });
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-4 text-sm w-full">
      <div>
        <FieldLabel>Feature</FieldLabel>
        <SelectItemFeature />
      </div>

      {!isBooleanFeature && <FeatureConfig />}

      {warning && (
        <WarningBox className="py-2">
          <div className="flex flex-col gap-2 relative">
            <div>
              {/* You already have a usage-based price for this feature. If you're
              looking to make it an overage (eg. 100 free, then $0.5
              thereafter), you should add it to the existing item. */}
              {warning}
            </div>

            {/* <div className="flex w-full p-0">
              <Button
                variant="ghost"
                size="sm"
                className="w-fit gap-1 !max-h-5 text-xs -mx-2  text-yellow-500 hover:text-yellow-700 hover:bg-transparent"
                endIcon={<ArrowRight size={12} />}
                onClick={handleAddToExistingItem}
              >
                Add to existing item
              </Button>
            </div> */}
          </div>
        </WarningBox>
      )}
    </div>
  );
};
