import { useAxiosSWR } from "@/services/useAxiosSwr";

export const useListProducts = () => {
  const { data, isLoading, error, mutate } = useAxiosSWR({
    url: "/v1/products",
    options: {
      refreshInterval: 0,
    },
  });

  return {
    products: data?.list || [],
    isLoading,
    error,
    mutate,
  };
};
