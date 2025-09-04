import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString } from "nuqs";
import { useQueryStates } from "nuqs";
import { useParams, useSearchParams } from "react-router";
import { useCachedProduct } from "./getCachedProduct";
import { useMemo } from "react";
import { useProductCountsQuery } from "./queries/useProductCountsQuery";
import { useMigrationsQuery } from "./queries/useMigrationsQuery.tsx";

// Product query state...
export const useProductQueryState = () => {
  const [queryStates, setQueryStates] = useQueryStates(
    {
      version: parseAsInteger,
      productId: parseAsString,
    },
    {
      history: "push",
    }
  );

  return { queryStates, setQueryStates };
};

export const useProductQuery = () => {
  const { product_id } = useParams();
  const { queryStates } = useProductQueryState();
  const productId = queryStates.productId || product_id;

  const axiosInstance = useAxiosInstance();
  const { getCachedProduct } = useCachedProduct({ productId: productId });

  const cachedProduct = useMemo(getCachedProduct, [getCachedProduct]);

  const fetcher = async () => {
    if (!productId) return null;
    const url = `/products/${productId}/data2`;
    const queryParams = {
      version: queryStates.version,
    };

    const { data } = await axiosInstance.get(url, { params: queryParams });
    return data;
  };

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["product", productId, queryStates.version],
    queryFn: fetcher,
  });

  const { refetch: refetchCounts } = useProductCountsQuery();
  const { refetch: refetchMigrations } = useMigrationsQuery();

  const product = data?.product || cachedProduct;
  const isLoadingWithCache = cachedProduct ? false : isLoading;

  return {
    product,
    numVersions: data?.numVersions || cachedProduct?.version || 1,
    isLoading: isLoadingWithCache,
    refetch: async () => {
      await refetch();
      await Promise.all([refetchMigrations(), refetchCounts()]);
    },
    error,
  };
};
