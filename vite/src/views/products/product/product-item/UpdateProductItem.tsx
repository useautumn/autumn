import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { ProductItemConfig } from "./ProductItemConfig";
import { ProductItem } from "@autumn/shared";
import { ProductItemContext } from "./ProductItemContext";
import { useProductContext } from "../ProductContext";
import { notNullish } from "@/utils/genUtils";

export default function UpdateProductItem({
  selectedItem,
  selectedIndex,
  setSelectedItem,
}: {
  selectedItem: ProductItem | null;
  selectedIndex: number | null;
  setSelectedItem: (item: ProductItem | null) => void;
}) {
  let { product, setProduct } = useProductContext();
  let [open, setOpen] = useState(false);
  let [item, setItem] = useState<ProductItem | null>(selectedItem);
  let [showCreateFeature, setShowCreateFeature] = useState(false);

  let handleUpdateProductItem = () => {
    if (notNullish(selectedIndex)) {
      let newProduct = { ...product };
      newProduct.items[selectedIndex!] = item;
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

  useEffect(() => {
    if (selectedItem) {
      setItem(selectedItem);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [selectedItem]);

  useEffect(() => {
    if (!open) {
      setSelectedItem(null);
    }
  }, [open]);

  return (
    <ProductItemContext.Provider
      value={{
        item,
        setItem,
        showCreateFeature,
        setShowCreateFeature,
        isUpdate: true,
        handleUpdateProductItem,
        handleDeleteProductItem,
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>Update Feature</DialogTitle>
          <ProductItemConfig />
        </DialogContent>
      </Dialog>
    </ProductItemContext.Provider>
  );
}
