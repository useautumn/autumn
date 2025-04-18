import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { ProductItemConfig } from "./ProductItemConfig";
import { ProductItem } from "@autumn/shared";
import { ProductItemContext } from "./ProductItemContext";
import { useProductContext } from "../ProductContext";
import { notNullish } from "@/utils/genUtils";
import { defaultProductItem } from "./CreateProductItem";
import { validateProductItem } from "@/utils/product/product-item/validateProductItem";
import CopyButton from "@/components/general/CopyButton";
export default function UpdateProductItem({
  selectedItem,
  selectedIndex,
  setSelectedItem,
  open,
  setOpen,
}: {
  selectedItem: ProductItem | null;
  selectedIndex: number | null;
  setSelectedItem: (item: ProductItem | null) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  let { product, setProduct } = useProductContext();

  // let [item, setItem] = useState<ProductItem>(
  //   selectedItem || defaultProductItem
  // );
  let [showCreateFeature, setShowCreateFeature] = useState(false);

  let handleUpdateProductItem = (show: any) => {
    const validatedItem = validateProductItem(selectedItem!, show);
    if (!validatedItem) return;
    if (notNullish(selectedIndex)) {
      let newProduct = { ...product };
      newProduct.items[selectedIndex!] = validatedItem;
      setProduct(newProduct);
      setOpen(false);
    }
  };

  let handleDeleteProductItem = () => {
    if (notNullish(selectedIndex)) {
      let newProduct = { ...product };
      newProduct.items.splice(selectedIndex!, 1);
      setProduct(newProduct);
      setOpen(false);
    }
  };

  // useEffect(() => {
  //   if (selectedItem) {
  //     setOpen(true);
  //   }
  // }, [selectedItem]);

  // useEffect(() => {
  //   console.log("open", open);
  //   // if (!open) {
  //   //   setSelectedItem(null);
  //   // }
  // }, [open]);

  return (
    <ProductItemContext.Provider
      value={{
        item: selectedItem,
        setItem: setSelectedItem,
        showCreateFeature,
        setShowCreateFeature,
        isUpdate: true,
        handleUpdateProductItem,
        handleDeleteProductItem,
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl overflow-visible">
          <div className="flex items-center justify-between pr-9.5">
            <DialogTitle>Update Item</DialogTitle>
            {selectedItem?.feature_id && (
              <CopyButton text={selectedItem.feature_id || ""}>
                {selectedItem.feature_id || ""}
              </CopyButton>
            )}
          </div>
          <ProductItemConfig />
        </DialogContent>
      </Dialog>
    </ProductItemContext.Provider>
  );
}
