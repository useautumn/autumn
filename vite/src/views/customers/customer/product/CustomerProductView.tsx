"use client";

import ProductSidebar from "@/views/products/product/ProductSidebar";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useState, useEffect, useRef } from "react";
import {
  Customer,
  Entity,
  Feature,
  FeatureOptions,
  ProductItem,
  ProductV2,
} from "@autumn/shared";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CustomToaster } from "@/components/general/CustomToaster";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductContext } from "@/views/products/product/ProductContext";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import ErrorScreen from "@/views/general/ErrorScreen";
import { ProductOptions } from "./ProductOptions";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useEnv } from "@/utils/envUtils";

import { FeaturesContext } from "@/views/features/FeaturesContext";
import { CustomerProductBreadcrumbs } from "./components/CustomerProductBreadcrumbs";
import { FrontendProduct, useAttachState } from "./hooks/useAttachState";

interface OptionValue {
  feature_id: string;
  threshold?: number;
  quantity?: number;
}

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

  const env = useEnv();

  const initialProductRef = useRef<FrontendProduct | null>(null);
  const [product, setProduct] = useState<FrontendProduct | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [options, setOptions] = useState<OptionValue[]>([]);
  const [entityId, setEntityId] = useState<string | null>(entityIdParam);
  const [entityFeatureIds, setEntityFeatureIds] = useState<string[]>([]);

  useEffect(() => {
    if (entityIdParam) {
      setEntityId(entityIdParam);
    } else {
      setEntityId(null);
    }
  }, [entityIdParam]);

  const version = searchParams.get("version");
  const customer_product_id = searchParams.get("id");
  const { data, isLoading, mutate, error } = useAxiosSWR({
    url: `/customers/${customer_id}/product/${product_id}${getProductUrlParams({
      version,
      customer_product_id,
      entity_id: entityId,
    })}`,
    env,
  });

  const [selectedEntitlementAllowance, setSelectedEntitlementAllowance] =
    useState<"unlimited" | number>(0);

  const attachState = useAttachState({
    product,
    setProduct,
    initialProductRef,
  });

  useEffect(() => {
    if (!data?.product || !data?.customer) return;

    const product = data.product;
    setProduct(product);
    initialProductRef.current = structuredClone(product);

    setEntityFeatureIds(
      Array.from(
        new Set(
          product.items
            .filter((item: ProductItem) => item.entity_feature_id != null)
            .map((item: ProductItem) => item.entity_feature_id),
        ),
      ),
    );

    if (product.options) {
      setOptions(product.options);
    } else {
      setOptions([]);
    }

    if (data?.features) {
      setFeatures(data.features);
    }
  }, [data]);

  if (error) {
    return (
      <ErrorScreen>
        <p>
          Customer {customer_id} or product {product_id} not found
        </p>
      </ErrorScreen>
    );
  }

  if (isLoading || !product) return <LoadingScreen />;

  if (!customer_id || !product_id) {
    return <div>Customer or product not found</div>;
  }

  const { customer } = data;

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
          customer: customer as Customer,
          entities: data.entities as Entity[],
          entityId,
          setEntityId,
          attachState,
          version,
          entityFeatureIds,
          setEntityFeatureIds,
        }}
      >
        <CustomToaster />

        <div className="flex w-full">
          <div className="flex flex-col gap-4 w-full">
            <CustomerProductBreadcrumbs />
            <div className="flex">
              <div className="flex-1 w-full min-w-sm">
                {product && <ManageProduct />}
                {options.length > 0 && (
                  <ProductOptions options={options} setOptions={setOptions} />
                )}
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
