import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useCustomersQueryStates } from "./useCustomersQueryStates";
import {
  CusProductSchema,
  CustomerSchema,
  FullCustomer,
  ProductSchema,
} from "@autumn/shared";
import { z } from "zod";
import { useState } from "react";

const CustomerWithProductsSchema = CustomerSchema.extend({
  customer_products: z.array(
    CusProductSchema.extend({ product: ProductSchema })
  ),
});
type CustomerWithProducts = z.infer<typeof CustomerWithProductsSchema>;

export const useCusSearchQuery = () => {
  const { queryStates } = useCustomersQueryStates();

  const axiosInstance = useAxiosInstance();
  const fetcher = async () => {
    const { data } = await axiosInstance.post(`/customers/all/search`, {
      search: queryStates.q || "",
      filters: {
        status: queryStates.status,
        version: queryStates.version,
        none: queryStates.none,
      },
      page: queryStates.page,
      page_size: 50,
    });
    return { customers: data.customers, totalCount: data.totalCount };
  };

  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching,
    isFetching,
    isPending,
    isPlaceholderData,
  } = useQuery<{
    customers: CustomerWithProducts[];
    totalCount: number;
  }>({
    queryKey: [
      "customers",
      queryStates.page,
      queryStates.status,
      queryStates.version,
      queryStates.none,
      queryStates.q,
    ],
    queryFn: fetcher,
    placeholderData: keepPreviousData,
  });

  const isFetchingUncached = Boolean(
    isPending || (isFetching && isPlaceholderData)
  );

  return {
    customers: data?.customers || [],
    totalCount: data?.totalCount || 0,
    isLoading,
    error,
    refetch,
    isRefetching,
    isFetchingUncached,
  };
};

// const { data, isLoading, error, mutate } = useAxiosPostSWR({
//   url: `/v1/customers/all/search`,
//   env,
//   data: {
//     search: queryStates.q || "",
//     filters: {
//       status: queryStates.status,
//       product_id: queryStates.product_id,
//       version: queryStates.version,
//       none: queryStates.none,
//     },
//     page: queryStates.page,
//     page_size: pageSize,
//     last_item: queryStates.lastItemId
//       ? { internal_id: queryStates.lastItemId }
//       : null,
//   },
// });
