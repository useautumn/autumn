import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "../../ProductItemContext";
import { isEmptyItem } from "@/utils/product/getItemType";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { useProductContext } from "../../../ProductContext";
import { AddToEntityDropdown } from "./AddToEntityDropdown";
import { handleAutoSave } from "@/views/onboarding2/model-pricing/model-pricing-utils/modelPricingUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const ItemConfigFooter = ({
  setIntroDone,
}: {
  setIntroDone?: (introDone: boolean) => void;
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
    <div
      className={cn(
        "bg-stone-100 flex items-center h-10 gap-0 border-t border-zinc-200 justify-between"
      )}
    >
      {showIntro && setIntroDone ? (
        <Button
          variant="ghost"
          className="hover:!bg-zinc-200 p-1 h-6 ml-5 text-t3 rounded-md"
          onClick={() => setIntroDone?.(false)}
          startIcon={<ArrowLeftIcon size={12} />}
        >
          Back
        </Button>
      ) : (
        <div />
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
              console.log("New product:", newProduct);
              console.log("Auto save:", autoSave);

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
    </div>
  );
};

// {handleCreateProductItem &&
//   show.feature &&
//   item.feature_id &&
//   !entityFeatureIds.includes(item.feature_id) &&
//   entityFeatureIds.length > 0 ? (

//     </>
//   )
