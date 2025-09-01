import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FullProduct, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";

export const useProductsQuery = () => {
  const axiosInstance = useAxiosInstance();

  const fetchProducts = async () => {
    const { data } = await axiosInstance.get("/products/products");
    return data;
  };

  const { data, isLoading, error, refetch } = useQuery<{
    products: ProductV2[];
    groupToDefaults: Record<string, Record<string, FullProduct>>;
  }>({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  return {
    products: data?.products || [],
    groupToDefaults: data?.groupToDefaults || {},
    isLoading,
    error,
    refetch,
  };
};
