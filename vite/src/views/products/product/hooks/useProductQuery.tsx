import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString } from "nuqs";
import { useQueryStates } from "nuqs";
import { useParams, useSearchParams } from "react-router";
import { useCachedProduct } from "./getCachedProduct";
import { useMemo } from "react";

// Product query state...
export const useProductQueryState = () => {
  const [queryStates, setQueryStates] = useQueryStates(
    {
      version: parseAsInteger,
    },
    {
      history: "replace",
    }
  );

  return { queryStates, setQueryStates };
};

export const useProductQuery = () => {
  const { product_id } = useParams();
  const { queryStates } = useProductQueryState();

  const axiosInstance = useAxiosInstance();
  const { getCachedProduct } = useCachedProduct({ productId: product_id });

  const cachedProduct = useMemo(getCachedProduct, [getCachedProduct]);

  const fetcher = async () => {
    const url = `/products/${product_id}/data2`;
    const queryParams = {
      version: queryStates.version,
    };

    const { data } = await axiosInstance.get(url, { params: queryParams });
    return data;
  };

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["product", product_id, queryStates.version],
    queryFn: fetcher,
  });

  const product = data?.product || cachedProduct;
  console.log("Cached product:", cachedProduct);
  console.log("Error:", error);
  console.log("Is loading:", isLoading);
  const isLoadingWithCache = cachedProduct ? false : isLoading;

  return { product, isLoading: isLoadingWithCache, refetch, error };
};
