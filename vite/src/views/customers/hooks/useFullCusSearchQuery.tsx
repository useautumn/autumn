import { FullCustomer } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCustomersQueryStates } from "./useCustomersQueryStates";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useFullCusSearchQuery = () => {
  const { queryStates } = useCustomersQueryStates();
  const axiosInstance = useAxiosInstance();

  const { data: fullCustomersData } = useQuery<{
    fullCustomers: FullCustomer[];
  }>({
    queryKey: [
      "full_customers",
      queryStates.page,
      queryStates.status,
      queryStates.version,
      queryStates.none,
      queryStates.q,
    ],
    queryFn: async () => {
      console.log("Fetching full customers: ", queryStates.q);
      const { data } = await axiosInstance.post(
        `/customers/all/full_customers`,
        {
          search: queryStates.q,
          page_size: 50,
          page: queryStates.page,
          filters: {
            status: queryStates.status,
            version: queryStates.version,
            none: queryStates.none,
          },
        }
      );

      console.log("data", data);
      return data;
    },
    placeholderData: keepPreviousData,
  });
};
