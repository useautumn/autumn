import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { ProductService } from "@/services/products/ProductService";
import { useNavigate } from "react-router";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useProductsContext } from "./ProductsContext";
import { PlusIcon, Check } from "lucide-react";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { ProductConfig } from "./ProductConfig";
import { ProductV2 } from "@autumn/shared";
import { ToggleButton } from "@/components/general/ToggleButton";

export const defaultProduct = {
  name: "",
  id: "",
  group: "",
  is_add_on: false,
  is_default: false,
};

function CreateProduct({
  onSuccess,
}: {
  onSuccess?: (newProduct: ProductV2) => Promise<void>;
}) {
  const { env, mutate } = useProductsContext();
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState(defaultProduct);
  const [open, setOpen] = useState(false);

  const axiosInstance = useAxiosInstance({ env });
  const navigate = useNavigate();

  const handleCreateClicked = async () => {
    setLoading(true);
    try {
      const newProduct = await ProductService.createProduct(
        axiosInstance,
        product
      );

      await mutate();

      if (onSuccess) {
        await onSuccess(newProduct);
      } else {
        navigateTo(`/products/${newProduct.id}`, navigate, env);
      }
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create product"));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setProduct(defaultProduct);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="add">Product</Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogTitle>Create Product</DialogTitle>
        <ProductConfig
          product={product}
          setProduct={setProduct}
          isUpdate={false}
        />

        <DialogFooter>
          <div className="flex justify-between items-center gap-2 w-full mt-4">
            <div className="flex gap-4">
              <ToggleButton
                disabled={product?.is_add_on}
                buttonText="Default"
                infoContent="This product is enabled by default for all new users, typically used for your free plan"
                value={product?.is_default}
                setValue={() =>
                  setProduct({
                    ...product,
                    is_default: !product?.is_default,
                  })
                }
              />
              <ToggleButton
                disabled={product?.is_default}
                buttonText="Add-on"
                infoContent="This product is an add-on that can be bought together with your base products (eg, for top ups)"
                value={product?.is_add_on}
                setValue={() =>
                  setProduct({ ...product, is_add_on: !product?.is_add_on })
                }
              />
            </div>
            <Button
              isLoading={loading}
              onClick={handleCreateClicked}
              variant="gradientPrimary"
              className="min-w-44 w-44 max-w-44"
            >
              Create Product
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateProduct;
