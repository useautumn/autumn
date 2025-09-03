"use client";

import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import ProductSidebar from "./ProductSidebar";
import ProductViewBreadcrumbs from "./components/ProductViewBreadcrumbs";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";

import { toast } from "sonner";
import { useState } from "react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductContext } from "./ProductContext";
import { useParams, useSearchParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ManageProduct } from "./ManageProduct";
import { AppEnv, UpdateProductSchema } from "@autumn/shared";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";
import { useProductChangedAlert } from "./hooks/useProductChangedAlert";
import { useProductData } from "./hooks/useProductData";
import { UpdateProductButton } from "./components/UpdateProductButton";
import { useProductQuery } from "./hooks/useProductQuery";

function ProductView({ env }: { env: AppEnv }) {
  const axiosInstance = useAxiosInstance();
  const { product_id } = useParams();
  const [searchParams] = useSearchParams();
  const version = searchParams.get("version");

  // const url = `/products/${product_id}/data?version=${version}`;
  // const { data, isLoading, mutate } = useAxiosSWR({ url });

  // const countUrl = `/products/${product_id}/count?version=${version}`;
  // const { data: counts, mutate: mutateCount } = useAxiosSWR({ url: countUrl });

  const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
  const { product: originalProduct, isLoading, error } = useProductQuery();

  const {
    product,
    setProduct,
    hasChanges,
    entityFeatureIds,
    setEntityFeatureIds,
    actionState,
    isNewProduct,
  } = useProductData({ originalProduct });

  const { modal } = useProductChangedAlert({ hasChanges });

  if (isLoading) return <LoadingScreen />;
  if (error) {
    return (
      <ErrorScreen returnUrl="/products">
        {error ? error.message : `Product ${product_id} not found`}
      </ErrorScreen>
    );
  }

  if (!product) return <></>;

  // const updateProduct = async () => {
  //   try {
  //     await ProductService.updateProduct(axiosInstance, product.id, {
  //       ...UpdateProductSchema.parse(product),
  //       items: product.items,
  //       free_trial: product.free_trial,
  //     });

  //     if (isNewProduct) {
  //       toast.success("Product created successfully");
  //     } else {
  //       toast.success("Product updated successfully");
  //     }

  //     await refetch();
  //     await mutateCount();
  //   } catch (error) {
  //     toast.error(getBackendErr(error, "Failed to update product"));
  //   }
  // };

  // const updateProductClicked = async () => {
  //   if (!counts) {
  //     toast.error("Something went wrong, please try again...");
  //     return;
  //   }

  //   if (version && version < data?.numVersions) {
  //     toast.error("You can only update the latest version of a product");
  //     return;
  //   }

  //   if (counts?.all > 0) {
  //     setShowNewVersionDialog(true);
  //     return;
  //   }

  //   await updateProduct();
  // };

  return (
    <ProductContext.Provider
      value={{
        // ...data,
        // features,
        // setFeatures,

        // For versioning?
        // counts,
        // version,

        // mutate,
        // env,

        product,
        setProduct,

        // mutateCount,
        actionState,
        // handleCreateProduct: updateProductClicked,
        entityFeatureIds,
        setEntityFeatureIds,
        hasChanges,
      }}
    >
      {/* <ConfirmNewVersionDialog
        open={showNewVersionDialog}
        setOpen={setShowNewVersionDialog}
        createProduct={updateProduct}
      /> */}
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
  );
}

export default ProductView;
