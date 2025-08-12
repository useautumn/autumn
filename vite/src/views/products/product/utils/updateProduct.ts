import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";
import { Product, ProductV2, UpdateProductSchema } from "@autumn/shared";
import { AxiosInstance } from "axios";
import { toast } from "sonner";
import { isFreeProduct } from "@/utils/product/priceUtils";

export const updateProduct = async ({
  axiosInstance,
  product,
  mutate,
  mutateCount,
}: {
  axiosInstance: AxiosInstance;
  product: ProductV2;
  mutate: () => void;
  mutateCount: () => void;
}) => {
  try {
    // Frontend validation for default trial requirements
    if (product.free_trial?.is_default_trial) {
      if (isFreeProduct(product.items || [])) {
        toast.error("Default trial must be on a paid product");
        return;
      }
      if (product.free_trial.card_required) {
        toast.error("Default trial cannot require a card");
        return;
      }
    }

    await ProductService.updateProduct(axiosInstance, product.id, {
      ...UpdateProductSchema.parse(product),
      items: product.items,
      free_trial: product.free_trial,
    });

    toast.success("Product updated successfully");

    await mutate();
    await mutateCount();
  } catch (error) {
    toast.error(getBackendErr(error, "Failed to update product"));
  }
};
