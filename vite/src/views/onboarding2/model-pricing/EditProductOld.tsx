import { DialogFooter } from "@/components/ui/dialog";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import { CreateFreeTrial } from "@/views/products/product/free-trial/CreateFreeTrial";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductContext } from "@/views/products/product/ProductContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { ToggleButton } from "@/components/general/ToggleButton";

export const EditProductDialog = ({
  product,
  features,
  setProduct,
  setFeatures,
  mutate,
  open,
  setOpen,
  originalProduct,
  entityFeatureIds,
  setEntityFeatureIds,
}: {
  product: any;
  setProduct: (product: any) => void;
  features: any[];
  setFeatures: (features: any[]) => void;
  mutate: () => Promise<void>;
  open: boolean;
  setOpen: (open: boolean) => void;
  originalProduct: any;
  entityFeatureIds: string[];
  setEntityFeatureIds: (entityFeatureIds: string[]) => void;
}) => {
  const env = useEnv();
  const axiosInstance = useAxiosInstance();
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [freeTrialModalOpen, setFreeTrialModalOpen] = useState(false);

  // Store the original product state when modal opens
  const handleOpenChange = async (newOpen: boolean) => {
    if (!newOpen && open && product?.id) {
      // Modal is being closed, check if there are changes
      const hasChanges =
        originalProduct &&
        JSON.stringify(product) !== JSON.stringify(originalProduct);

      if (hasChanges) {
        // Only update if there are changes
        updateProduct();
      }
    }
    setOpen(newOpen);
  };

  const updateProduct = async () => {
    setCreateProductLoading(true);
    try {
      const res = await ProductService.updateProduct(
        axiosInstance,
        product.id,
        product
      );
      toast.success("Product updated successfully");
      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
    setCreateProductLoading(false);
  };

  const handleFreeTrialClick = () => {
    if (product?.free_trial) {
      // Delete the free trial
      setProduct({ ...product, free_trial: null });
    } else {
      // Open the free trial modal
      setFreeTrialModalOpen(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 py-8 min-w-[500px] min-h-[300px] flex flex-col justify-between">
        <DialogTitle className="text-t2 font-semibold px-10 hidden">
          {/* Edit Product */}
        </DialogTitle>
        <div>
          <FeaturesContext.Provider
            value={{
              env,
              mutate,
            }}
          >
            <ProductContext.Provider
              value={{
                product,
                setProduct,
                mutate,
                env,
                features,
                setFeatures,
                entityFeatureIds,
                setEntityFeatureIds,
              }}
            >
              <CreateFreeTrial
                open={freeTrialModalOpen}
                setOpen={setFreeTrialModalOpen}
              />
              <ManageProduct hideAdminHover={true} />
            </ProductContext.Provider>
          </FeaturesContext.Provider>
        </div>
        <DialogFooter>
          <div className="flex justify-between items-center gap-2 px-10 w-full mt-6">
            <div className="flex gap-6">
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
              <Button
                variant="outline"
                onClick={handleFreeTrialClick}
                className={`min-w-32 flex items-center gap-2`}
              >
                {product?.free_trial ? (
                  <div className="flex items-center gap-2 justify-between w-full">
                    <p>
                      {product?.free_trial?.length}{" "}
                      {product.free_trial?.duration} trial
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      isIcon
                      onClick={() => {
                        setProduct({ ...product, free_trial: null });
                      }}
                      className="hover:bg-zinc-300 !h-4 !w-4 text-t3"
                    >
                      <X size={12} />
                    </Button>
                  </div>
                ) : (
                  // <div className="w-3 h-3 bg-lime-500 rounded-full flex items-center justify-center">

                  //   {/* <Check className="w-2 h-2 text-white" /> */}
                  // </div>
                  <p>Add Free Trial</p>
                )}
              </Button>
            </div>
            <Button
              isLoading={createProductLoading}
              variant="gradientPrimary"
              onClick={updateProduct}
              className="min-w-44 w-44 max-w-44"
            >
              Update Product
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
