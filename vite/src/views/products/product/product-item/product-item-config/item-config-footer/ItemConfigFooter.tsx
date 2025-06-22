import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "../../ProductItemContext";
import { isEmptyItem } from "@/utils/product/getItemType";
import { XIcon } from "lucide-react";
import { useProductContext } from "../../../ProductContext";
import { AddToEntityDropdown } from "./AddToEntityDropdown";

export const ItemConfigFooter = () => {
  const { entityFeatureIds } = useProductContext();
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

  return (
    <div
      className={cn(
        "bg-stone-100 flex items-center h-10 gap-0 border-t border-zinc-200 justify-end",
      )}
    >
      {/* <AddPriceButton /> */}
      {/* <AddFeatureButton /> */}
      {handleUpdateProductItem && (
        <Button
          className="hover:border-red-500 text-red-500"
          variant="add"
          startIcon={<XIcon size={12} />}
          onClick={handleDeleteProductItem}
        >
          Delete Item
        </Button>
      )}
      {handleUpdateProductItem && (
        <Button variant="add" onClick={handleUpdateProductItem}>
          Update Item
        </Button>
      )}
      {showEntityDropdown && handleCreateProductItem && <AddToEntityDropdown />}
      {!showEntityDropdown && handleCreateProductItem && (
        <Button
          variant="add"
          onClick={() => handleCreateProductItem(null)}
          disabled={isEmpty}
        >
          Add Item
        </Button>
      )}
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
