import ConfirmNewVersionDialog from "@/views/products/product/versioning/ConfirmNewVersionDialog";
import { CreateFreeTrial } from "@/views/products/product/free-trial/CreateFreeTrial";
import { CreateProductItem2 } from "@/views/products/product/product-item/CreateProductItem2";
import { ProductItemTable } from "@/views/products/product/product-item/ProductItemTable";
import { ProductContext } from "@/views/products/product/ProductContext";
import { AddTrialButton } from "./AddTrialButton";
import { useState } from "react";
import { useEnv } from "@/utils/envUtils";
import { handleAutoSave } from "./model-pricing-utils/modelPricingUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useModelPricingContext } from "./ModelPricingContext";
import { isFreeProduct } from "@/utils/product/priceUtils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SaveIcon } from "lucide-react";
import { Product } from "@autumn/shared";
import { updateProduct } from "@/views/products/product/utils/updateProduct";
import { getBackendErr } from "@/utils/genUtils";
import { EditProductDetails } from "./edit-product/EditProductDetails";
import { ToggleDefaultProduct } from "@/views/products/product/product-sidebar/ToggleDefaultProduct";

export const EditProduct = ({ mutate }: { mutate: any }) => {
  const [freeTrialModalOpen, setFreeTrialModalOpen] = useState(false);
  const { data, productCount, productDataState, mutateCounts } =
    useModelPricingContext();

  const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);

  const {
    product,
    setProduct,
    features,
    setFeatures,
    entityFeatureIds,
    setEntityFeatureIds,
    actionState,
  } = productDataState;

  const [details, setDetails] = useState({
    name: product.name,
    id: product.id,
  });

  const axiosInstance = useAxiosInstance();
  const env = useEnv();

  const [saveLoading, setSaveLoading] = useState(false);

  const runUpdateProduct = async () => {
    setSaveLoading(true);
    try {
      await updateProduct({
        axiosInstance,
        product,
        mutate,
        mutateCount: mutateCounts,
      });
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSaveClicked = async () => {
    if (productCount?.all > 0) {
      setShowNewVersionDialog(true);
      return;
    }
    await runUpdateProduct();
  };

  const hasItems = product.items.length > 0;
  const hasCustomers = productCount?.all > 0;
  const showSaveButton = hasCustomers || product.version > 1;
  const firstProductCreated = data.products.length > 0;

  const autoSave = !showSaveButton && firstProductCreated;

  const handleToggleSettings = async (key: string) => {
    if (!product) return;

    const curValue = product[key as keyof Product];
    const newProduct = { ...product, [key]: !curValue };

    // Validate
    if (key === "is_default" && !isFreeProduct(product.items)) {
      toast.error("Default product must be a free product");
      return;
    }

    setProduct(newProduct);

    if (!showSaveButton) {
      handleAutoSave({
        axiosInstance,
        productId: product.id ? product.id : details.id,
        product: { ...product, [key]: !curValue },
        mutate,
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 justify-between h-full">
      <div className="flex gap-4 transition-all duration-500 ease-in-out">
        <ProductContext.Provider
          value={{
            groupDefaults: data.groupToDefaults?.[product?.group || ""],
            product,
            setProduct,
            mutate,
            env,
            features,
            setFeatures,
            entityFeatureIds,
            setEntityFeatureIds,
            isOnboarding: true,
            autoSave: !showSaveButton,
          }}
        >
          <ConfirmNewVersionDialog
            open={showNewVersionDialog}
            setOpen={setShowNewVersionDialog}
            createProduct={runUpdateProduct}
          />
          <CreateFreeTrial
            open={freeTrialModalOpen}
            setOpen={setFreeTrialModalOpen}
          />

          <div
            className={`flex flex-col gap-4 transition-all duration-500 ease-in-out ${
              hasItems ? "w-3/5" : "w-full"
            }`}
          >
            <div className="flex gap-2 items-end justify-between">
              <EditProductDetails />
              {showSaveButton && (
                <Button
                  className="w-fit h-8 text-xs"
                  startIcon={<SaveIcon size={12} className="mr-1" />}
                  disabled={actionState.disabled}
                  onClick={handleSaveClicked}
                  isLoading={saveLoading}
                >
                  Save Product
                </Button>
              )}
            </div>

            {firstProductCreated && (
              <>
                {product.items.length == 0 ? (
                  <p className="text-t2 text-sm w-md mt-4">
                    {/* Next, add items to define what customers with this product
                      get access to, and how much they should be charged for it. */}
                    Next, add which features your customers can use on this
                    product and how much it should cost.
                  </p>
                ) : (
                  <div
                    className={`bg-white border border-zinc-200 transition-all duration-500 ease-in-out ${
                      hasItems ? "w-full" : "w-full"
                    }`}
                  >
                    <ProductItemTable />
                  </div>
                )}
                <CreateProductItem2 classNames={{ button: "max-w-md" }} />{" "}
              </>
            )}
          </div>

          <div
            // transition-all duration-500 ease-in-out
            className={` ${
              hasItems
                ? "w-2/5 opacity-100 translate-x-0 ml-4"
                : "w-0 opacity-0 translate-x-8 overflow-hidden"
            }`}
          >
            <div className="flex flex-col gap-4" style={{ width: "320px" }}>
              <div>
                {/* <ToggleButton
                    disabled={product?.is_add_on}
                    buttonText="Default Product"
                    value={product?.is_default}
                    className="text-t2 font-medium h-fit mb-2"
                    setValue={() => handleToggleSettings("is_default")}
                  /> */}
                <div className="flex items-center text-sm text-t2 gap-2">
                  <p className="text-t2 font-medium">Default Product</p>
                  <ToggleDefaultProduct toggleKey="is_default" />
                </div>
                <div className="text-t3 text-sm" style={{ width: "320px" }}>
                  A default product is enabled by default for all new users,
                  typically used for your free plan.
                </div>
              </div>
              <div className="">
                {/* <ToggleButton
                    disabled={product?.is_default}
                    buttonText="Add-on Product"
                    className="text-t2 font-medium h-fit mb-2"
                    value={product?.is_add_on}
                    setValue={() => handleToggleSettings("is_add_on")}
                  /> */}
                <div className="flex items-center text-sm text-t2 gap-2">
                  <p className="text-t2 font-medium">Add On Product</p>
                  <ToggleDefaultProduct toggleKey="is_add_on" />
                </div>
                <div className="text-t3 text-sm" style={{ width: "320px" }}>
                  A product that can be added on top of a customer's main plan.
                  Eg. one time purchases or top ups.
                </div>
              </div>
              <div>
                <AddTrialButton />
                <div className="text-t3 text-sm" style={{ width: "320px" }}>
                  Add a free trial to your product.
                </div>
              </div>
            </div>
          </div>
        </ProductContext.Provider>
      </div>
    </div>
  );
};
