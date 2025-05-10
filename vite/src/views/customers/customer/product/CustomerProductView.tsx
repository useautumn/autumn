"use client";

import React, { useState, useEffect, useRef } from "react";
import { Entity, Feature, FeatureOptions, ProductV2 } from "@autumn/shared";

import {
  BreadcrumbItem,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { useAxiosSWR } from "@/services/useAxiosSwr";

import LoadingScreen from "@/views/general/LoadingScreen";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CustomToaster } from "@/components/general/CustomToaster";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductContext } from "@/views/products/product/ProductContext";

import { CusService } from "@/services/customers/CusService";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  getBackendErr,
  getBackendErrObj,
  getRedirectUrl,
  navigateTo,
} from "@/utils/genUtils";

import { ErrCode } from "@autumn/shared";
import { AddProductButton } from "../add-product/AddProductButton";
import ErrorScreen from "@/views/general/ErrorScreen";

import { ProductService } from "@/services/products/ProductService";
import RequiredOptionsModal from "./RequiredOptionsModal";
import { ProductOptions } from "./ProductOptions";

import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { pricesOnlyOneOff } from "@/utils/product/priceUtils";
import ProductSidebar from "@/views/products/product/ProductSidebar";
import { FeaturesContext } from "@/views/features/FeaturesContext";

interface OptionValue {
  feature_id: string;
  threshold?: number;
  quantity?: number;
}

export enum ProductActionState {
  NoChanges = "no_changes",
  UpdateOptionsOnly = "update_options_only",
  CreateCustomVersion = "create_custom_version",
  EnableProduct = "enable_product",
}

// Helper to build query params for product URL
function getProductUrlParams({
  version,
  customer_product_id,
  entity_id,
}: {
  version?: string | null;
  customer_product_id?: string | null;
  entity_id?: string | null;
}) {
  const params = new URLSearchParams();
  if (version) params.append("version", version);
  if (customer_product_id)
    params.append("customer_product_id", customer_product_id);
  if (entity_id) params.append("entity_id", entity_id);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export default function CustomerProductView() {
  const { customer_id, product_id } = useParams();
  const [searchParams] = useSearchParams();
  const entityIdParam = searchParams.get("entity_id");
  const [entityId, setEntityId] = useState<string | null>(entityIdParam);
  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });
  const navigation = useNavigate();

  type FrontendProduct = ProductV2 & {
    isActive: boolean;
    options: FeatureOptions[];
  };

  const [product, setProduct] = useState<FrontendProduct | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [options, setOptions] = useState<OptionValue[]>([]);

  useEffect(() => {
    if (entityIdParam) {
      setEntityId(entityIdParam);
    } else {
      setEntityId(null);
    }
  }, [entityIdParam]);

  let version = searchParams.get("version");
  let customer_product_id = searchParams.get("id");
  const { data, isLoading, mutate, error } = useAxiosSWR({
    url: `/customers/${customer_id}/product/${product_id}${getProductUrlParams({
      version,
      customer_product_id,
      entity_id: entityId,
    })}`,
    env,
  });

  const [url, setUrl] = useState<any>(null);

  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [requiredOptions, setRequiredOptions] = useState<OptionValue[]>([]);
  const [useInvoice, setUseInvoice] = useState(false);
  const [selectedEntitlementAllowance, setSelectedEntitlementAllowance] =
    useState<"unlimited" | number>(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasOptionsChanges, setHasOptionsChanges] = useState(false);
  const initialProductRef = useRef<FrontendProduct | null>(null);

  useEffect(() => {
    if (data?.product) {
      setProduct(data.product);
      initialProductRef.current = data.product;
    }
    if (data?.features) {
      setFeatures(data.features);
    }
  }, [data]);

  useEffect(() => {
    if (!data?.product || !data?.customer) return;

    let product = data.product;
    initialProductRef.current = structuredClone(product);

    if (product.options) {
      setOptions(product.options);
    } else {
      setOptions([]);
    }
    setProduct(product);
  }, [data, product_id]);

  useEffect(() => {
    if (!initialProductRef.current || !product) {
      setHasChanges(false);
      return;
    }

    const hasChanged =
      JSON.stringify({
        items: product.items,
        free_trial: product.free_trial,
      }) !==
      JSON.stringify({
        items: initialProductRef.current.items,
        free_trial: initialProductRef.current.free_trial,
      });

    const hasOptionsChanged =
      JSON.stringify(options) !==
      JSON.stringify(initialProductRef.current.options);

    setHasChanges(hasChanged);
    setHasOptionsChanges(hasOptionsChanged);
  }, [product, options]);

  if (error) {
    console.log("Use Axios SWR Error: ", error);
    return (
      <ErrorScreen>
        <p>
          Customer {customer_id} or product {product_id} not found
        </p>
      </ErrorScreen>
    );
  }

  if (isLoading) return <LoadingScreen />;
  const oneTimePurchase = pricesOnlyOneOff(
    product?.items || [],
    product?.is_add_on || false
  );

  if (!customer_id || !product_id) {
    return <div>Customer or product not found</div>;
  }

  if (!product) {
    return <div>Product not found</div>;
  }

  const { customer, entities } = data;

  const entity = entities.find((entity: Entity) => entity.id === entityId);

  const handleCreateProduct = async (useInvoiceLatest?: boolean) => {
    try {
      const { data } = await ProductService.getRequiredOptions(axiosInstance, {
        items: product.items,
      });

      if (data.options && data.options.length > 0) {
        setRequiredOptions(data.options);
        return;
      }

      // Continue with product creation if no required options
      await createProduct(
        useInvoiceLatest !== undefined ? useInvoiceLatest : useInvoice
      );
    } catch (error) {
      toast.error(getBackendErr(error, "Error checking required options"));
    }
  };

  const createProduct = async (useInvoiceLatest?: boolean) => {
    try {
      let isCustom = hasChanges;

      const { data } = await CusService.addProduct(axiosInstance, customer_id, {
        product_id,
        entity_id: entityId,
        items: product.items,
        free_trial: product.free_trial,
        options: requiredOptions ? requiredOptions : options,
        is_custom: isCustom,

        invoice_only:
          useInvoiceLatest !== undefined ? useInvoiceLatest : useInvoice,

        version:
          version && Number.isInteger(parseInt(version))
            ? parseInt(version)
            : product.version,
      });

      navigateTo(
        `/customers/${customer_id}/${product_id}${getProductUrlParams({
          version,
          customer_product_id,
          entity_id: entityId,
        })}`,
        navigation,
        env
      );

      toast.success(data.message || "Successfully attached product");

      if (data.checkout_url) {
        setUrl({
          type: "checkout",
          value: data.checkout_url,
        });
        setCheckoutDialogOpen(true);
      }

      if (data.invoice) {
        window.open(getStripeInvoiceLink(data.invoice), "_blank");
      }
    } catch (error) {
      console.log("Error creating product: ", error);
      const errObj = getBackendErrObj(error);

      if (errObj?.code === ErrCode.StripeConfigNotFound) {
        toast.error(errObj?.message);
        const redirectUrl = getRedirectUrl(`/customers/${customer_id}`, env);
        navigateTo(
          `/integrations/stripe?redirect=${redirectUrl}`,
          navigation,
          env
        );
      } else {
        toast.error(getBackendErr(error, "Error creating product"));
      }
    }
  };

  const getProductActionState = () => {
    if (oneTimePurchase) {
      return {
        buttonText: "Purchase Product",
        tooltipText: "Purchase this product for the customer",
        disabled: false,
      };
    }

    if (product.is_add_on) {
      return {
        buttonText: "Enable Product",
        tooltipText: `Enable product ${product.name} for ${customer.name}`,
        disabled: false,
      };
    }
    // Case 1: Product is active, no changes, and is not an add-on
    if (product.isActive && !hasOptionsChanges && !hasChanges) {
      return {
        buttonText: "Update Product",
        tooltipText: "No changes have been made to update",
        disabled: true,
      };
    }

    if (product.isActive && hasOptionsChanges && !hasChanges) {
      return {
        buttonText: "Update Options",
        tooltipText: "You're editing the quantity of a live product",
        disabled: false,
        state: ProductActionState.UpdateOptionsOnly,
        successMessage: "Product updated successfully",
      };
    }

    if (product.isActive && !product.is_add_on) {
      return {
        buttonText: "Update Product",
        tooltipText: `You're editing the live product ${product.name} and updating it to a custom version for ${customer.name}`,

        disabled: false, //TODO: remove this
      };
    }
    if (hasChanges) {
      return {
        buttonText: "Create Custom Version",
        tooltipText: `You have edited product ${product.name} and are creating a custom version for ${customer.name}`,
        disabled: false,
      };
    }
    return {
      buttonText: "Enable Product",
      tooltipText: `Enable product ${product.name} for ${customer.name}`,
      disabled: false,
    };
  };

  const actionState = getProductActionState();

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
          customer: data.customer,
          handleCreateProduct,
          actionState,
          setUseInvoice,
          entityId,
          setEntityId,
        }}
      >
        <CustomToaster />

        <RequiredOptionsModal
          requiredOptions={requiredOptions}
          createProduct={createProduct}
          setRequiredOptions={setRequiredOptions}
          product={product}
        />

        <Dialog
          open={checkoutDialogOpen}
          onOpenChange={() => {
            setCheckoutDialogOpen(false);
            setUrl(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{url && keyToTitle(url.type)}</DialogTitle>
            </DialogHeader>

            {url && (
              <CopyUrl url={url.value} isInvoice={url.type == "invoice"} />
            )}
          </DialogContent>
        </Dialog>

        <div className="flex w-full">
          <div className="flex flex-col gap-4 w-full">
            <Breadcrumb className="text-t3 pt-6 pl-10 flex justify-center">
              <BreadcrumbList className="text-t3 text-xs w-full">
                <BreadcrumbItem>
                  <BreadcrumbLink
                    className="cursor-pointer"
                    onClick={() => navigateTo("/customers", navigation, env)}
                  >
                    Customers
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbLink
                  className="cursor-pointer truncate max-w-48"
                  onClick={() =>
                    navigateTo(
                      `/customers/${customer_id}${
                        entityId ? `?entity_id=${entityId}` : ""
                      }`,
                      navigation,
                      env
                    )
                  }
                >
                  {customer.name
                    ? customer.name
                    : customer.id
                    ? customer.id
                    : customer.email}
                </BreadcrumbLink>
                <BreadcrumbSeparator />
                <BreadcrumbItem>{product.name}</BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex">
              <div className="flex-1 w-full min-w-sm">
                {product && (
                  <ManageProduct
                    customerData={data}
                    showFreeTrial={false}
                    setShowFreeTrial={() => {}}
                    version={version ? parseInt(version) : product.version}
                  />
                )}
                {options.length > 0 && (
                  <ProductOptions
                    options={options}
                    setOptions={setOptions}
                    oneTimePurchase={oneTimePurchase || false}
                  />
                )}
                <div className="flex justify-end gap-2 p-4 block lg:hidden">
                  <div className="w-fit">
                    <AddProductButton />
                  </div>
                </div>
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

export const CopyUrl = ({
  url,
  isInvoice = false,
}: {
  url: string;
  isInvoice: boolean;
}) => {
  return (
    <div className="flex flex-col gap-2">
      {!isInvoice && (
        <p className="text-sm text-gray-500">
          This link will expire in 24 hours
        </p>
      )}
      <div className="w-full bg-gray-100 p-3 rounded-md">
        <Link
          className="text-xs text-t2 break-all hover:underline"
          to={url}
          target="_blank"
        >
          {url}
        </Link>
      </div>
    </div>
  );
};
