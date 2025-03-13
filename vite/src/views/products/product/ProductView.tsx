"use client";

import React, { useEffect, useRef, useState } from "react";
import LoadingScreen from "@/views/general/LoadingScreen";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductContext } from "./ProductContext";
import { useNavigate, useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CustomToaster } from "@/components/general/CustomToaster";
import { ManageProduct } from "./ManageProduct";

import { AppEnv, FrontendProduct, FrontendOrganization } from "@autumn/shared";
import { toast } from "react-hot-toast";
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

function ProductView({ env }: { env: AppEnv }) {
  const { product_id } = useParams();
  const navigate = useNavigate();
  const axiosInstance = useAxiosInstance({ env });
  const initialProductRef = useRef<FrontendProduct | null>(null);

  const [product, setProduct] = useState<FrontendProduct | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading, mutate } = useAxiosSWR({
    url: `/products/${product_id}/data`,
    env,
  });

  console.log(data);

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

  const handleCreateProduct = async () => {
    try {
      await ProductService.updateProduct(axiosInstance, product.id, {
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
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
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
      }}
    >
      <div className="flex flex-col gap-0.5">
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
        <ManageProduct product={product} />
      </div>
      <div className="flex justify-end gap-2">
        <AddProductButton
          handleCreateProduct={handleCreateProduct}
          actionState={actionState}
        />
      </div>
    </ProductContext.Provider>
  );
}

export default ProductView;
