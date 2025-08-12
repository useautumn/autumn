"use client";

import { useState } from "react";
import LoadingScreen from "@/views/general/LoadingScreen";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductContext } from "./ProductContext";
import { useParams, useSearchParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ManageProduct } from "./ManageProduct";
import { AppEnv, UpdateProductSchema } from "@autumn/shared";
import { toast } from "sonner";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";
import { UpdateProductButton } from "@/views/products/product/components/UpdateProductButton";
import { updateProduct as updateProductUtil } from "./utils/updateProduct";
import { isFreeProduct } from "@/utils/product/priceUtils";

import ErrorScreen from "@/views/general/ErrorScreen";
import ProductSidebar from "./ProductSidebar";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import ProductViewBreadcrumbs from "./components/ProductViewBreadcrumbs";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";
import { useProductData } from "./hooks/useProductData";
import { useProductChangedAlert } from "./hooks/useProductChangedAlert";

function ProductView({ env }: { env: AppEnv }) {
  const axiosInstance = useAxiosInstance();

  const { product_id } = useParams();
  const [searchParams] = useSearchParams();
  const version = searchParams.get("version");

  const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);

  const url = `/products/${product_id}/data?version=${version}`;
  const { data, isLoading, mutate } = useAxiosSWR({ url });

  const countUrl = `/products/${product_id}/count?version=${version}`;
  const { data: counts, mutate: mutateCount } = useAxiosSWR({ url: countUrl });

  //this is to make sure pricing for unlimited entitlements can't be applied
  const [selectedEntitlementAllowance, setSelectedEntitlementAllowance] =
    useState<"unlimited" | number>(0);

  const {
    product,
    setProduct,
    hasChanges,
    features,
    setFeatures,
    entityFeatureIds,
    setEntityFeatureIds,
    actionState,
    isNewProduct,
  } = useProductData({
    originalProduct: data?.product as any,
    originalFeatures: data?.features as any,
  });

  const { modal } = useProductChangedAlert({ hasChanges });
  const [buttonLoading, setButtonLoading] = useState(false);

  if (isLoading) return <LoadingScreen />;

  if (!product) {
    return (
      <ErrorScreen returnUrl="/products">
        Product {product_id} not found
      </ErrorScreen>
    );
  }

  const updateProduct = async () => {
    try {
      await ProductService.updateProduct(axiosInstance, product.id, {
        ...UpdateProductSchema.parse(product),
        items: product.items,
        free_trial: product.free_trial,
      });

      if (isNewProduct) {
        toast.success("Product created successfully");
      } else {
        toast.success("Product updated successfully");
      }

      await mutate();
      await mutateCount();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
  };

  const updateProductClicked = async () => {
    if (!counts) {
      toast.error("Something went wrong, please try again...");
      return;
    }

    if (version && version < data?.numVersions) {
      toast.error("You can only update the latest version of a product");
      return;
    }

    if (counts?.all > 0) {
      setShowNewVersionDialog(true);
      return;
    }

    await updateProduct();
  };


  return (
    <FeaturesContext.Provider
      value={{
        env,
        mutate,
      }}
    >
      <ProductContext.Provider
        value={{
          ...data,
          features,
          setFeatures,
          mutate,
          env,
          product,
          setProduct,
          selectedEntitlementAllowance,
          setSelectedEntitlementAllowance,
          counts,
          version,
          mutateCount,
          actionState,
          handleCreateProduct: updateProductClicked,
          entityFeatureIds,
          setEntityFeatureIds,
          hasChanges,
          buttonLoading,
          setButtonLoading,
        }}
      >
        <ConfirmNewVersionDialog
          open={showNewVersionDialog}
          setOpen={setShowNewVersionDialog}
          createProduct={updateProduct}
        />
        <div className="flex w-full">
          <div className="flex flex-col gap-4 w-full">
            <ProductViewBreadcrumbs />

            <div className="flex">
              <div className="flex-1 w-full min-w-sm">
                <ManageProduct />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-10 w-full lg:hidden">
              <div className="w-fit">
                <UpdateProductButton />
              </div>
            </div>
          </div>
          <div className="flex max-w-md w-1/3 shrink-1 lg:block lg:min-w-xs sticky top-0">
            <ProductSidebar />
          </div>
        </div>
        {modal}
      </ProductContext.Provider>
    </FeaturesContext.Provider>
  );
}

export default ProductView;
