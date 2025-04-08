"use client";

import React, { useEffect, useRef, useState } from "react";
import LoadingScreen from "@/views/general/LoadingScreen";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductContext } from "./ProductContext";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ManageProduct } from "./ManageProduct";

import { AppEnv, FrontendProduct, UpdateProductSchema } from "@autumn/shared";
import { toast } from "sonner";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { AddProductButton } from "@/views/customers/customer/add-product/AddProductButton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import ErrorScreen from "@/views/general/ErrorScreen";
import ConfirmNewVersionDialog from "./ConfirmNewVersionDialog";

function ProductView({ env }: { env: AppEnv }) {
  const { product_id } = useParams();
  const navigate = useNavigate();
  const axiosInstance = useAxiosInstance({ env });
  const initialProductRef = useRef<FrontendProduct | null>(null);

  const [product, setProduct] = useState<FrontendProduct | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  // const [version, setVersion] = useState<number | null>(null);
  // Get version from url query params
  const [searchParams] = useSearchParams();
  const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
  const version = searchParams.get("version");

  const { data, isLoading, mutate } = useAxiosSWR({
    url: `/products/${product_id}/data?version=${version}`,
    env,
  });

  const { data: counts, mutate: mutateCount } = useAxiosSWR({
    url: `/products/${product_id}/count?version=${version}`,
    env,
  });

  //this is to make sure pricing for unlimited entitlements can't be applied
  const [selectedEntitlementAllowance, setSelectedEntitlementAllowance] =
    useState<"unlimited" | number>(0);

  useEffect(() => {
    if (data?.product) {
      setProduct(data.product);

      initialProductRef.current = data.product;
    }
  }, [data]);

  useEffect(() => {
    if (!initialProductRef.current || !product) {
      setHasChanges(false);
      return;
    }

    const hasChanged =
      JSON.stringify({
        prices: product.prices,
        entitlements: product.entitlements,
        free_trial: product.free_trial,
      }) !==
      JSON.stringify({
        prices: initialProductRef.current.prices,
        entitlements: initialProductRef.current.entitlements,
        free_trial: initialProductRef.current.free_trial,
      });
    setHasChanges(hasChanged);
  }, [product]);

  const isNewProduct =
    initialProductRef.current?.entitlements?.length === 0 &&
    initialProductRef.current?.prices?.length === 0 &&
    !initialProductRef.current?.free_trial;

  const actionState = {
    disabled: !hasChanges,
    buttonText: isNewProduct ? "Create Product" : "Update Product",
    tooltipText: !hasChanges
      ? isNewProduct
        ? "Add entitlements and prices to create a new product"
        : `Make a change to the entitlements or prices to update ${product?.name}`
      : isNewProduct
      ? `Create a new product: ${product?.name} `
      : `Save changes to product: ${product?.name}`,
  };

  if (isLoading) return <LoadingScreen />;

  if (!product) {
    return (
      <ErrorScreen returnUrl="/products">
        Product {product_id} not found
      </ErrorScreen>
    );
  }

  const createProduct = async () => {
    try {
      await ProductService.updateProduct(axiosInstance, product.id, {
        ...UpdateProductSchema.parse(product),
        prices: product.prices,
        entitlements: product.entitlements,
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

  const createProductClicked = async () => {
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

    await createProduct();
  };

  return (
    <ProductContext.Provider
      value={{
        ...data,
        mutate,
        env,
        product,
        setProduct,
        selectedEntitlementAllowance,
        setSelectedEntitlementAllowance,
        counts,
        version,
        mutateCount,
      }}
    >
      <ConfirmNewVersionDialog
        open={showNewVersionDialog}
        setOpen={setShowNewVersionDialog}
        createProduct={createProduct}
      />

      <div className="flex flex-col gap-0.5">
        {/* Confirm version modal */}
        <Breadcrumb className="text-t3">
          <BreadcrumbList className="text-t3 text-xs">
            <BreadcrumbItem
              onClick={() => navigateTo("/products", navigate, env)}
              className="cursor-pointer"
            >
              Products
            </BreadcrumbItem>

            <BreadcrumbSeparator />
            <BreadcrumbItem className="cursor-pointer">
              {product.name ? product.name : product.id}
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <ManageProduct
          product={product}
          version={version ? parseInt(version) : undefined}
        />
      </div>
      <div className="flex justify-end gap-2">
        <AddProductButton
          handleCreateProduct={createProductClicked}
          actionState={actionState}
        />
      </div>
    </ProductContext.Provider>
  );
}

export default ProductView;
