import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { ProductItemConfig } from "./ProductItemConfig";
import { FrontendProductItem, ProductItem } from "@autumn/shared";
import { ProductItemContext } from "./ProductItemContext";
import { useProductContext } from "../ProductContext";
import { notNullish } from "@/utils/genUtils";
import { validateProductItem } from "@/utils/product/product-item/validateProductItem";
import CopyButton from "@/components/general/CopyButton";

import {
  CustomDialogContent,
  CustomDialogBody,
} from "@/components/general/modal-components/DialogContentWrapper";

import { ItemConfigFooter } from "./product-item-config/item-config-footer/ItemConfigFooter";
import {
  AdvancedConfigSidebar,
  MainDialogBodyWrapper,
  ToggleAdvancedConfigButton,
} from "./product-item-config/AdvancedConfigSidebar";
import { isPriceItem } from "@/utils/product/getItemType";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

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
  const { features } = useFeaturesQuery();
  const { product, setProduct } = useProductContext();
  const [showCreateFeature, setShowCreateFeature] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setAdvancedOpen(false);
      }, 300);
    }
  }, [open]);

  const handleUpdateProductItem = () => {
    const frontendItem = selectedItem as FrontendProductItem;
    const validatedItem = validateProductItem({
      item: frontendItem!,
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
        <CustomDialogContent className="!max-w-none ">
          <div className="flex relative overflow-hidden w-full h-full overflow-y-auto">
            <MainDialogBodyWrapper advancedOpen={advancedOpen}>
              <CustomDialogBody className="!pb-0">
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
              <ToggleAdvancedConfigButton
                advancedOpen={advancedOpen}
                setAdvancedOpen={setAdvancedOpen}
                showAdvancedButton={
                  selectedItem ? !isPriceItem(selectedItem) : false
                }
              />
              <ItemConfigFooter />
            </MainDialogBodyWrapper>
            <AdvancedConfigSidebar advancedOpen={advancedOpen} />
          </div>
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
