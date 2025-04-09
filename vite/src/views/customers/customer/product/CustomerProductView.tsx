"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AppEnv,
  BillingInterval,
  FrontendOrganization,
  FrontendProduct,
  FullCusProduct,
} from "@autumn/shared";

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

export default function CustomerProductView() {
  const { customer_id, product_id } = useParams();
  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });
  const navigation = useNavigate();
  const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<FrontendProduct | null>(null);
  const [options, setOptions] = useState<OptionValue[]>([]);

  const { data, isLoading, mutate, error } = useAxiosSWR({
    url: `/customers/${customer_id}/data`,
    env,
  });

  const [url, setUrl] = useState<any>(null);

  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [requiredOptions, setRequiredOptions] = useState<OptionValue[]>([]);
  const [useInvoice, setUseInvoice] = useState(false);
  const initialProductRef = useRef<FrontendProduct | null>(null);
  const [selectedEntitlementAllowance, setSelectedEntitlementAllowance] =
    useState<"unlimited" | number>(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasOptionsChanges, setHasOptionsChanges] = useState(false);

  const cusProductId = searchParams.get("id");
  // Get product from customer data and check if it is active
  useEffect(() => {
    if (!data?.products || !data?.customer) return;

    const foundProduct = data.products.find((p: any) => p.id === product_id);

    if (!foundProduct) return;

    const customerProduct = data.customer.products.find(
      (p: FullCusProduct) => p.id === cusProductId
    );

    console.log("customerProduct", customerProduct);

    const enrichedProduct = enrichProduct(foundProduct, customerProduct);
    // console.log("enrichedProduct", enrichedProduct);

    setOptions(enrichedProduct.options);
    setProduct(enrichedProduct);
    initialProductRef.current = enrichedProduct;
  }, [data, product_id]);

  // Pure function to handle product enrichment
  const enrichProduct = (
    baseProduct: FrontendProduct,
    customerProduct?: {
      status?: string;
      options?: OptionValue[];
      entitlements?: typeof baseProduct.entitlements;
      prices?: typeof baseProduct.prices;
      free_trial?: typeof baseProduct.free_trial;
    }
  ) => {
    if (!customerProduct) {
      // console.log("baseProduct", baseProduct);
      return {
        ...baseProduct,
        isActive: false,
        options: [],
      };
    }

    return {
      ...baseProduct,
      isActive: customerProduct.status === "active",
      options: customerProduct.options ?? [],
      ...(customerProduct.entitlements && {
        entitlements: customerProduct.entitlements,
      }),
      ...(customerProduct.prices && {
        prices: customerProduct.prices,
      }),
      ...(customerProduct.free_trial && {
        free_trial: customerProduct.free_trial,
      }),
    };
  };

  //check if the user has made changes to the product state
  useEffect(() => {
    if (!initialProductRef.current || !product) {
      setHasChanges(false);
      return;
    }

    const hasChanged =
      JSON.stringify({
        prices: product.prices,
        entitlements: product.entitlements,
      }) !==
      JSON.stringify({
        prices: initialProductRef.current.prices,
        entitlements: initialProductRef.current.entitlements,
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
  const oneTimePurchase = product?.prices.every(
    (price) => price.config?.interval == BillingInterval.OneOff
  );

  const { customer } = data;

  if (!customer_id || !product_id) {
    return <div>Customer or product not found</div>;
  }

  if (!product) {
    return <div>Product not found</div>;
  }

  const handleCreateProduct = async (useInvoiceLatest?: boolean) => {
    try {
      if (oneTimePurchase || !product.isActive) {
        const { data } = await ProductService.getRequiredOptions(
          axiosInstance,
          {
            prices: product.prices,
            entitlements: product.entitlements,
          }
        );

        if (data.options && data.options.length > 0) {
          setRequiredOptions(data.options);
          return;
        }
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
      const { data } = await CusService.addProduct(axiosInstance, customer_id, {
        product_id,
        prices: product.prices,
        entitlements: product.entitlements,
        free_trial: product.free_trial,
        options: requiredOptions ? requiredOptions : options,
        is_custom: true,
        invoice_only:
          useInvoiceLatest !== undefined ? useInvoiceLatest : useInvoice,
      });

      await mutate();
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
        // setUrl({
        //   type: "invoice",
        //   value: ,
        // });
        // setCheckoutDialogOpen(true);
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
      <CustomToaster />

      <RequiredOptionsModal
        requiredOptions={requiredOptions}
        createProduct={createProduct}
        setRequiredOptions={setRequiredOptions}
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

          {url && <CopyUrl url={url.value} isInvoice={url.type == "invoice"} />}
        </DialogContent>
      </Dialog>

      <div className="p-6 flex flex-col gap-4 max-w-[1048px]">
        <div className="flex flex-col gap-2">
          <Breadcrumb className="text-t3">
            <BreadcrumbList className="text-t3 text-xs">
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
                className="cursor-pointer"
                onClick={() =>
                  navigateTo(`/customers/${customer_id}`, navigation, env)
                }
              >
                {customer.name ? customer.name : customer.id}
              </BreadcrumbLink>
              <BreadcrumbSeparator />
              <BreadcrumbItem>{product.name}</BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {product && (
            <ManageProduct
              product={product}
              customerData={data}
              showFreeTrial={false}
              setShowFreeTrial={() => {}}
            />
          )}
        </div>
        {options.length > 0 && (
          <ProductOptions
            options={options}
            setOptions={setOptions}
            oneTimePurchase={oneTimePurchase || false}
          />
        )}
        <div className="flex justify-end gap-2">
          {/* <ProductOptionsButton /> */}
          <AddProductButton
            handleCreateProduct={handleCreateProduct}
            actionState={actionState}
            setUseInvoice={setUseInvoice}
          />
        </div>
      </div>
    </ProductContext.Provider>
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
