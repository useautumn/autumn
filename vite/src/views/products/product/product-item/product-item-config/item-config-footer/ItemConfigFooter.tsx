import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "../../ProductItemContext";
import { isEmptyItem } from "@/utils/product/getItemType";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { useProductContext } from "../../../ProductContext";
import { AddToEntityDropdown } from "./AddToEntityDropdown";
import { handleAutoSave } from "@/views/onboarding2/model-pricing/model-pricing-utils/modelPricingUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CustomDialogFooter } from "@/components/general/modal-components/DialogContentWrapper";

export const ItemConfigFooter = ({
  handleBack,
}: {
  handleBack?: () => void;
}) => {
  const axiosInstance = useAxiosInstance();
  const { entityFeatureIds, product, mutate, autoSave } = useProductContext();
  const {
    item,
    handleCreateProductItem,
    handleUpdateProductItem,
    handleDeleteProductItem,
  } = useProductItemContext();

  const showEntityDropdown =
    item.feature_id &&
    !entityFeatureIds.includes(item.feature_id) &&
    entityFeatureIds.length > 0;

  const isEmpty = isEmptyItem(item);

  const showIntro = product.items.length === 0;

  return (
    <CustomDialogFooter className="flex h-full items-center w-full justify-between">
      {handleBack ? (
        <Button
          variant="dialogBack"
          onClick={handleBack}
          startIcon={<ArrowLeftIcon size={12} />}
        >
          Back
        </Button>
      ) : (
        <div></div>
      )}

      <div className="flex">
        {handleUpdateProductItem && (
          <Button
            className="hover:border-red-500 text-red-500"
            variant="add"
            startIcon={<XIcon size={12} />}
            onClick={async () => {
              const newProduct = await handleDeleteProductItem();

              if (autoSave && newProduct) {
                handleAutoSave({
                  axiosInstance,
                  productId: product.id,
                  product,
                  mutate,
                });
              }
            }}
          >
            Delete Item
          </Button>
        )}
        {handleUpdateProductItem && (
          <Button
            variant="add"
            onClick={async () => {
              const newProduct = await handleUpdateProductItem();

              if (autoSave && newProduct) {
                handleAutoSave({
                  axiosInstance,
                  productId: product.id,
                  product,
                  mutate,
                });
              }
            }}
          >
            Update Item
          </Button>
        )}
        {showEntityDropdown && handleCreateProductItem && (
          <AddToEntityDropdown />
        )}
        {!showEntityDropdown && handleCreateProductItem && (
          <Button
            variant="add"
            onClick={async () => {
              const newProduct = await handleCreateProductItem(null);

              if (autoSave && newProduct) {
                handleAutoSave({
                  axiosInstance,
                  productId: product.id,
                  product: newProduct,
                  mutate,
                });
              }
            }}
            disabled={isEmpty}
          >
            Add Item
          </Button>
        )}
      </div>
    </CustomDialogFooter>
  );
};

// {handleCreateProductItem &&
//   show.feature &&
//   item.feature_id &&
//   !entityFeatureIds.includes(item.feature_id) &&
//   entityFeatureIds.length > 0 ? (

//     </>
//   )
