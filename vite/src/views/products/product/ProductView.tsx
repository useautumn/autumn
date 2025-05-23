"use client";

import { useEffect, useRef, useState } from "react";
import LoadingScreen from "@/views/general/LoadingScreen";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductContext } from "./ProductContext";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ManageProduct } from "./ManageProduct";
import {
  AppEnv,
  Feature,
  FrontendProduct,
  ProductItem,
  ProductItemType,
  ProductV2,
  UpdateProductSchema,
} from "@autumn/shared";
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
import ProductSidebar from "./ProductSidebar";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import ProductViewBreadcrumbs from "./components/ProductViewBreadcrumbs";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";
import { getItemType } from "@/utils/product/productItemUtils";

function ProductView({ env }: { env: AppEnv }) {
  const { product_id } = useParams();
  const [searchParams] = useSearchParams();
  const version = searchParams.get("version");

  const axiosInstance = useAxiosInstance({ env });
  const initialProductRef = useRef<ProductV2 | null>(null);

  const [product, setProduct] = useState<ProductV2 | null>(null);
  const [showFreeTrial, setShowFreeTrial] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
  const [features, setFeatures] = useState<Feature[]>([]);

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
  const [originalProduct, setOriginalProduct] = useState<ProductV2 | null>(
    null,
  );

  useEffect(() => {
    if (data?.product) {
      const sortedProduct = {
        ...data.product,
        items: sortProductItems(data.product.items),
      };
      setProduct(sortedProduct);
      setOriginalProduct(structuredClone(sortedProduct));
    }

    if (data?.features) {
      setFeatures(data.features);
    }

    setShowFreeTrial(!!data?.product?.free_trial);
  }, [data]);

  useEffect(() => {
    //sort product items and check if there are changes from the original
    if (!product) return;
    const sortedProduct = {
      ...product,
      items: sortProductItems(product.items),
    };

    if (JSON.stringify(product.items) !== JSON.stringify(sortedProduct.items)) {
      setProduct(sortedProduct);
    }

    if (!originalProduct || !sortedProduct) {
      setHasChanges(false);
      return;
    }

    const hasChanged =
      JSON.stringify(sortedProduct) !== JSON.stringify(originalProduct);
    setHasChanges(hasChanged);
  }, [product]);

  const isNewProduct =
    // initialProductRef.current?.entitlements?.length === 0 &&
    // initialProductRef.current?.prices?.length === 0 &&
    initialProductRef.current?.items?.length === 0 &&
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
          handleCreateProduct: createProductClicked,
        }}
      >
        <ConfirmNewVersionDialog
          open={showNewVersionDialog}
          setOpen={setShowNewVersionDialog}
          createProduct={createProduct}
        />
        <div className="flex w-full">
          <div className="flex flex-col gap-4 w-full">
            <ProductViewBreadcrumbs />

            <div className="flex">
              <div className="flex-1 w-full min-w-sm">
                <ManageProduct />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-10 w-full lg:hidden block">
              <div className="w-fit">
                <AddProductButton />
              </div>
            </div>
          </div>
          <div className="max-w-[300px] w-1/3 shrink-1 hidden lg:block">
            <ProductSidebar />
          </div>
        </div>
      </ProductContext.Provider>
    </FeaturesContext.Provider>
  );
}

export default ProductView;

const sortProductItems = (items: ProductItem[]) => {
  const sortedItems = [...items].sort((a, b) => {
    const typeA = getItemType(a);
    const typeB = getItemType(b);

    const typeOrder = {
      [ProductItemType.Feature]: 0,
      [ProductItemType.FeaturePrice]: 1,
      [ProductItemType.Price]: 2,
    };

    return typeOrder[typeA] - typeOrder[typeB];
  });

  return sortedItems;
};
