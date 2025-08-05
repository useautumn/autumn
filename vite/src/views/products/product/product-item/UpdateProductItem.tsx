import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { ProductItemConfig } from "./ProductItemConfig";
import { ProductItem } from "@autumn/shared";
import { ProductItemContext } from "./ProductItemContext";
import { useProductContext } from "../ProductContext";
import { notNullish } from "@/utils/genUtils";
import { validateProductItem } from "@/utils/product/product-item/validateProductItem";
import CopyButton from "@/components/general/CopyButton";

import {
  CustomDialogContent,
  CustomDialogBody,
  CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { ItemConfigFooter } from "./product-item-config/item-config-footer/ItemConfigFooter";

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
  const { product, setProduct, features } = useProductContext();
  const [showCreateFeature, setShowCreateFeature] = useState(false);

  const handleUpdateProductItem = () => {
    const validatedItem = validateProductItem({
      item: selectedItem!,
      features,
    });

    if (!validatedItem) return null;
    if (notNullish(selectedIndex)) {
      const newProduct = { ...product };
      newProduct.items[selectedIndex!] = validatedItem;
      setProduct(newProduct);
      setOpen(false);

      return newProduct;
    }
  };

  const handleDeleteProductItem = () => {
    if (notNullish(selectedIndex)) {
      const newProduct = { ...product };
      newProduct.items.splice(selectedIndex!, 1);
      setProduct(newProduct);
      setOpen(false);
      return newProduct;
    }
  };

  return (
    <ProductItemContext.Provider
      value={{
        item: selectedItem,
        setItem: setSelectedItem,
        selectedIndex,
        showCreateFeature,
        setShowCreateFeature,
        isUpdate: true,
        handleUpdateProductItem,
        handleDeleteProductItem,
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <CustomDialogContent>
          <CustomDialogBody>
            <div className="flex items-center justify-between pr-9.5">
              <DialogTitle>Update Item</DialogTitle>
              {selectedItem?.feature_id && (
                <CopyButton text={selectedItem.feature_id || ""}>
                  {selectedItem.feature_id || ""}
                </CopyButton>
              )}
            </div>
            <ProductItemConfig />
          </CustomDialogBody>

          <ItemConfigFooter />
        </CustomDialogContent>

        {/* <DialogContent className="translate-y-[0%] top-[20%] flex flex-col w-fit gap-0 p-0">
          <DialogContentWrapper>
            <div className="flex items-center justify-between pr-9.5">
              <DialogTitle>Update Item</DialogTitle>
              {selectedItem?.feature_id && (
                <CopyButton text={selectedItem.feature_id || ""}>
                  {selectedItem.feature_id || ""}
                </CopyButton>
              )}
            </div>
            <ProductItemConfig />
          </DialogContentWrapper>
          <ItemConfigFooter />
        </DialogContent> */}
      </Dialog>
    </ProductItemContext.Provider>
  );
}
