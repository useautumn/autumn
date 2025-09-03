import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FullCusProduct, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useParams } from "react-router";

export const useCusProductQuery = () => {
  const axiosInstance = useAxiosInstance();
  const { customer_id, product_id } = useParams();

  const [queryStates] = useQueryStates({
    version: parseAsInteger,
    customer_product_id: parseAsString,
    entity_id: parseAsString,
  });

  const fetcher = async () => {
    const queryParams = {
      version: queryStates.version,
      customer_product_id: queryStates.customer_product_id,
      entity_id: queryStates.entity_id,
    };

    try {
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
    queryKey: ["customer_product", customer_id, product_id],
    queryFn: fetcher,
  });

  return {
    cusProduct: data?.cusProduct,
    product: data?.product,
    isLoading,
    error,
    refetch,
  };

  // const { data, isLoading, error, refetch } = useQuery({
  //   queryKey: ["customer_product", customer_id, product_id],
  //   queryFn: fetcher,
  // });
  // return {
  //   cusProduct,
  //   isLoading,
  //   error,
  //   refetch,
  // };
};
