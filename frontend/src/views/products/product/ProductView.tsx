"use client";

import React, { useEffect, useRef, useState } from "react";
import LoadingScreen from "@/views/general/LoadingScreen";

import { BreadcrumbItem, Breadcrumbs } from "@nextui-org/react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductContext } from "./ProductContext";
import { useRouter } from "next/navigation";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CustomToaster } from "@/components/general/CustomToaster";
import { ManageProduct } from "./ManageProduct";

import { AppEnv, FrontendProduct, Organization } from "@autumn/shared";
import { toast } from "react-hot-toast";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { AddProductButton } from "@/views/customers/customer/add-product/AddProductButton";

function ProductView({
  product_id,
  env,
  org,
}: {
  product_id: string;
  env: AppEnv;
  org: Organization;
}) {
  const router = useRouter();
  const axiosInstance = useAxiosInstance({ env });
  const initialProductRef = useRef<FrontendProduct | null>(null);

  const [product, setProduct] = useState<FrontendProduct | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading, mutate } = useAxiosSWR({
    url: `/products/${product_id}/data`,
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
    return <div>Product not found</div>;
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
        org,
      }}
    >
      <CustomToaster />

      <div className="flex flex-col gap-0.5">
        <Breadcrumbs className="text-t3">
          <BreadcrumbItem
            size="sm"
            onClick={() => navigateTo("/products", router, env)}
          >
            Products
          </BreadcrumbItem>
          <BreadcrumbItem size="sm">{product.name}</BreadcrumbItem>
        </Breadcrumbs>
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
