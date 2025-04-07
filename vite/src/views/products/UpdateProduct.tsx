import {
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Product, UpdateProductSchema } from "@autumn/shared";
import { useRef, useState } from "react";
import { ProductConfig } from "./ProductConfig";
import React from "react";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ProductService } from "@/services/products/ProductService";
import { useEnv } from "@/utils/envUtils";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { useProductsContext } from "./ProductsContext";

export const UpdateProductDialog = ({
  selectedProduct,
  setSelectedProduct,
  setModalOpen,
  setDropdownOpen,
}: {
  selectedProduct: Product;
  setSelectedProduct: (product: Product) => void;
  setModalOpen: (open: boolean) => void;
  setDropdownOpen: (open: boolean) => void;
}) => {
  const { mutate } = useProductsContext();
  const originalProduct = useRef(selectedProduct);
  const [product, setProduct] = useState(selectedProduct);
  const [saveLoading, setSaveLoading] = useState(false);
  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  const handleSave = async () => {
    setSaveLoading(true);
    let originalProductId = originalProduct.current.id;
    try {
      await ProductService.updateProduct(axiosInstance, originalProductId, {
        ...UpdateProductSchema.parse(product),
      });
      await mutate();
      setModalOpen(false);
      // if (setDropdownOpen) {
      //   setDropdownOpen(false);
      // }
      toast.success(`Successfully updated product ${product.id}`);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
    setSaveLoading(false);
  };
  return (
    <React.Fragment>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogTitle>Edit Product</DialogTitle>
        <div className="flex flex-col gap-4">
          <ProductConfig
            product={product}
            setProduct={setProduct}
            isUpdate={true}
          />
        </div>
        <DialogFooter>
          <Button
            variant="gradientPrimary"
            onClick={handleSave}
            isLoading={saveLoading}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </React.Fragment>
  );
};
