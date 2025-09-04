import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FullCusProduct, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useParams } from "react-router";
import { useCusProductCache } from "./useCusProductCache";
import { useMemo } from "react";

export const useCusProductQuery = () => {
  const axiosInstance = useAxiosInstance();
  const { customer_id, product_id } = useParams();
  const [queryStates] = useQueryStates({
    version: parseAsInteger,
    customer_product_id: parseAsString,
    entity_id: parseAsString,
  });

  const { getCachedCusProduct } = useCusProductCache({
    customerId: customer_id,
    productId: product_id,
    queryStates: {
      version: queryStates.version ?? undefined,
      customerProductId: queryStates.customer_product_id ?? undefined,
      entityId: queryStates.entity_id ?? undefined,
    },
  });

  const cachedCusProduct = useMemo(getCachedCusProduct, [getCachedCusProduct]);

  const fetcher = async () => {
    const queryParams = {
      version: queryStates.version,
      customer_product_id: queryStates.customer_product_id,
      entity_id: queryStates.entity_id,
    };

    try {
      console.log(
        `Fetching customer product ${product_id} with version ${queryStates.version}`
      );
      const { data } = await axiosInstance.get(
        `/customers/${customer_id}/product/${product_id}`,
        { params: queryParams }
      );
      return data;
    } catch (error) {
      return null;
    }
  };

  const { data, isLoading, error, refetch } = useQuery<{
    cusProduct: FullCusProduct;
    product: ProductV2;
  }>({
    queryKey: [
      "customer_product",
      customer_id,
      product_id,
      queryStates.version,
      queryStates.customer_product_id,
      queryStates.entity_id,
    ],
    queryFn: fetcher,
  });

  const finalData = data || cachedCusProduct;
  const isLoadingWithCache = cachedCusProduct ? false : isLoading;

  return {
    cusProduct: finalData?.cusProduct,
    product: finalData?.product,
    isLoading: isLoadingWithCache,
    error,
    refetch,
  };
};
