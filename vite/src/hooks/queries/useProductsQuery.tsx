import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FullProduct, ProductCounts, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";

export const useProductsQuery = () => {
  const axiosInstance = useAxiosInstance();

  const fetchProducts = async () => {
    const { data } = await axiosInstance.get("/products/products");
    return data;
  };

  const fetchProductCounts = async () => {
    const { data } = await axiosInstance.get("/products/product_counts");
    return data;
  };

  const { data, isLoading, error, refetch } = useQuery<{
    products: ProductV2[];
    groupToDefaults: Record<string, Record<string, FullProduct>>;
  }>({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  const { data: countsData, refetch: countsRefetch } = useQuery<
    Record<string, ProductCounts>
  >({
    queryKey: ["product_counts"],
    queryFn: fetchProductCounts,
  });

  return {
    products: data?.products || [],
    counts: countsData || {},
    groupToDefaults: data?.groupToDefaults || {},
    isLoading,
    error,
    refetch: async () => {
      await Promise.all([countsRefetch(), refetch()]);
    },
    // mutate: async () => {
    //   await Promise.all([countsRefetch(), refetch()]);
    // },
  };
};
