import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";
import { Upload } from "lucide-react";
import { useProductQuery } from "../hooks/useProductQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { UpdateProductSchema } from "@autumn/shared";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";

export const UpdateProductButton = () => {
  const [buttonLoading, setButtonLoading] = useState(false);
  const axiosInstance = useAxiosInstance();

  const { actionState, product } = useProductContext();

  const { refetch } = useProductQuery();

  const updateProduct = async () => {
    try {
      await axiosInstance.post(`/v1/products/${product.id}`, {
        ...UpdateProductSchema.parse(product),
        items: product.items,
        free_trial: product.free_trial,
      });
      // await ProductService.updateProduct(axiosInstance, product.id, {
      //   ...UpdateProductSchema.parse(product),
      //   items: product.items,
      //   free_trial: product.free_trial,
      // });

      toast.success("Product updated successfully");
      // if (isNewProduct) {
      //   toast.success("Product created successfully");
      // } else {
      // }

      await refetch();
      // await mutateCount();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
  };

  return (
    <Button
      onClick={async () => {
        setButtonLoading(true);
        await updateProduct();
        setButtonLoading(false);
      }}
      variant="gradientPrimary"
      className="w-full gap-2"
      isLoading={buttonLoading}
      disabled={actionState.disabled}
      startIcon={<Upload size={12} />}
    >
      {actionState.buttonText}
    </Button>
  );
};
