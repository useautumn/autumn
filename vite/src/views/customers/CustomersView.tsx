"use client";

import React, { useRef } from "react";
import { AppEnv } from "@autumn/shared";
import { CustomersContext } from "./CustomersContext";
import { CustomersTable } from "./components/CustomersTable";
import LoadingScreen from "../general/LoadingScreen";
import { CustomersTopBar } from "./components/customers-top-bar/CustomersTopBar";
import { useCusSearchQuery } from "./hooks/useCusSearchQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCustomersQueryStates } from "./hooks/useCustomersQueryStates";
import { useSavedViewsQuery } from "./hooks/useSavedViewsQuery";

function CustomersView({ env }: { env: AppEnv }) {
  const { customers, totalCount, isLoading, error, refetch } =
    useCusSearchQuery();

  const { queryStates, setQueryStates } = useCustomersQueryStates();

  const { products, isLoading: productsLoading } = useProductsQuery();
  useSavedViewsQuery();
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

  const isFirstRender = useRef(true);
  const paginationFirstRender = useRef(true);
  const searchParamsChanged = useRef(false);
  const isDirectNavigation = useRef(false);

  // const resetPagination = () => {
  //   setQueryStates({
  //     page: 1,
  //     lastItemId: "",
  //   });
  // };

  // useEffect(() => {
  //   if (isFirstRender.current) {
  //     isFirstRender.current = false;

  //     const hasFilters =
  //       queryStates.q ||
  //       queryStates.status ||
  //       queryStates.product_id ||
  //       queryStates.version ||
  //       queryStates.none;
  //     const hasDirectNavigation =
  //       queryStates.page > 1 || !!queryStates.lastItemId;

  //     if (!hasFilters && !hasDirectNavigation) {
  //       return;
  //     }

  //     isDirectNavigation.current = hasDirectNavigation;

  //     setPaginationLoading(true);
  //     refetch().finally(() => {
  //       setPaginationLoading(false);
  //     });
  //     return;
  //   }

  //   if (isDirectNavigation.current) {
  //     isDirectNavigation.current = false;
  //     return;
  //   }

  //   searchParamsChanged.current = true;
  //   resetPagination();

  //   setPaginationLoading(true);
  //   refetch().finally(() => {
  //     setPaginationLoading(false);
  //   });
  // }, [
  //   queryStates.q,
  //   queryStates.status,
  //   queryStates.product_id,
  //   queryStates.version,
  //   queryStates.none,
  // ]);

  // useEffect(() => {
  //   if (paginationFirstRender.current) {
  //     paginationFirstRender.current = false;
  //     return;
  //   }

  //   if (searchParamsChanged.current) {
  //     searchParamsChanged.current = false;
  //     if (queryStates.page === 1) {
  //       return;
  //     }
  //   }

  //   setPaginationLoading(true);
  //   refetch().finally(() => {
  //     setPaginationLoading(false);
  //   });
  // }, [queryStates.page, queryStates.lastItemId]);

  if (productsLoading) {
    return <LoadingScreen />;
  }

  // const handleNextPage = async () => {
  //   if (totalPages == 0 || queryStates.page === totalPages) return;
  //   const lastItem = data?.customers[data?.customers.length - 1];

  //   setQueryStates({
  //     page: queryStates.page + 1,
  //     lastItemId: lastItem.internal_id, // This becomes the "cursor" for the next page
  //   });
  // };

  // const handlePreviousPage = async () => {
  //   if (queryStates.page === 1) return;
  //   // For previous page, we clear the lastItemId to force offset-based pagination
  //   setQueryStates({
  //     page: queryStates.page - 1,
  //     lastItemId: "",
  //   });
  // };

  // const handleFilterChange = (newFilters: any) => {
  //   const params: Record<string, string | number> = {
  //     page: 1,
  //     lastItemId: "",
  //   };

  //   if (newFilters?.status?.length > 0) {
  //     params.status = newFilters.status.join(",");
  //   } else {
  //     params.status = "";
  //   }

  //   // Handle new version-based filtering (productId:version format)
  //   if (newFilters?.version) {
  //     params.version = newFilters.version;
  //   } else {
  //     params.version = "";
  //   }

  //   // Legacy product_id support (keep for now)
  //   if (newFilters?.product_id?.length > 0) {
  //     params.product_id = newFilters.product_id.join(",");
  //   } else {
  //     params.product_id = "";
  //   }

  //   // Handle none filter
  //   if (newFilters?.none) {
  //     params.none = "true";
  //   } else {
  //     params.none = "";
  //   }

  //   setQueryStates(params);
  //   refetch();
  // };

  return (
    <CustomersContext.Provider
      value={{
        customers,
        // env,
        // mutate,
        // filters: {
        //   status: queryStates.status?.split(",").filter(Boolean) || [],
        //   product_id: queryStates.product_id?.split(",").filter(Boolean) || [],
        //   version: queryStates.version,
        //   none: queryStates.none === "true",
        // },
        // setFilters: handleFilterChange,
        // products: productsData?.products,
        // versionCounts: productsData?.versionCounts,
        // setQueryStates,
        // mutateSavedViews,
      }}
    >
      <div className="flex flex-col gap-4 h-fit relative w-full ">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Customers</h1>
        <div>
          <CustomersTopBar />
          {customers?.length && customers?.length > 0 ? (
            <div className="h-fit max-h-full">
              <CustomersTable customers={customers} />
            </div>
          ) : (
            <div className="flex flex-col px-10 mt-3 text-t3 text-sm w-full min-h-[60vh] gap-4">
              <span>
                {queryStates.q?.trim()
                  ? "No matching results found. Try a different search."
                  : "Create your first customer by interacting with an Autumn function via the API."}
              </span>
            </div>
          )}
        </div>
      </div>
    </CustomersContext.Provider>
  );
}

export default CustomersView;
