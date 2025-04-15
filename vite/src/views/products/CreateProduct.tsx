import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProductService } from "@/services/products/ProductService";
import { useNavigate } from "react-router";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import React, { useState } from "react";
import { toast } from "sonner";
import { useProductsContext } from "./ProductsContext";
import { PlusIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { ProductConfig } from "./ProductConfig";

let defaultProduct = {
  name: "",
  id: "",
  group: "",
  is_add_on: false,
  is_default: false,
};
function CreateProduct() {
  const { env, mutate } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env });
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState(defaultProduct);

  const [idChanged, setIdChanged] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCreateClicked = async () => {
    setLoading(true);
    try {
      const productId = await ProductService.createProduct(
        axiosInstance,
        product
      );

      await mutate();

      navigateTo(`/products/${productId}`, navigate, env);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create product"));
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="text-primary p-0"
          startIcon={<PlusIcon size={15} />}
        >
          Create Product
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogTitle>Create Product</DialogTitle>
        <ProductConfig
          product={product}
          setProduct={setProduct}
          isUpdate={false}
        />

        <DialogFooter>
          <Button
            isLoading={loading}
            onClick={handleCreateClicked}
            variant="gradientPrimary"
          >
            Create Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateProduct;
