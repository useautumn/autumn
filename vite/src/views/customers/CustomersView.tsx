"use client";

import React, { useEffect, useRef } from "react";
import { AppEnv } from "@autumn/shared";
import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import { CustomersContext } from "./CustomersContext";
import { CustomersTable } from "./CustomersTable";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import CreateCustomer from "./CreateCustomer";
import { SearchBar } from "./SearchBar";
import LoadingScreen from "../general/LoadingScreen";
import FilterButton from "./FilterButton";

import SmallSpinner from "@/components/general/SmallSpinner";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";

function CustomersView({ env }: { env: AppEnv }) {
  const pageSize = 50;

  const [queryStates, setQueryStates] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      product_id: parseAsString.withDefault(""),
      version: parseAsString.withDefault(""),
      none: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      lastItemId: parseAsString.withDefault(""),
    },
    {
      history: "replace",
    }
  );

  const [searching, setSearching] = React.useState(false);
  const [paginationLoading, setPaginationLoading] = React.useState(false);

  const { data: productsData, isLoading: productsLoading } = useAxiosSWR({
    url: `/products/data?all_versions=true`,
  });

  const { data: savedViewsData, mutate: mutateSavedViews } = useAxiosSWR({
    url: "/saved_views",
  });

  const { data, isLoading, error, mutate } = useAxiosPostSWR({
    url: `/v1/customers/all/search`,
    env,
    data: {
      search: queryStates.q || "",
      filters: {
        status: queryStates.status,
        product_id: queryStates.product_id,
        version: queryStates.version,
        none: queryStates.none,
      },
      page: queryStates.page,
      page_size: pageSize,
      last_item: queryStates.lastItemId
        ? { internal_id: queryStates.lastItemId }
        : null,
    },
  });

  const isFirstRender = useRef(true);
  const paginationFirstRender = useRef(true);
  const searchParamsChanged = useRef(false);
  const isDirectNavigation = useRef(false);

  const resetPagination = () => {
    setQueryStates({
      page: 1,
      lastItemId: "",
    });
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;

      const hasFilters =
        queryStates.q ||
        queryStates.status ||
        queryStates.product_id ||
        queryStates.version ||
        queryStates.none;
      const hasDirectNavigation =
        queryStates.page > 1 || !!queryStates.lastItemId;

      if (!hasFilters && !hasDirectNavigation) {
        return;
      }

      isDirectNavigation.current = hasDirectNavigation;

      setPaginationLoading(true);
      mutate().finally(() => {
        setPaginationLoading(false);
      });
      return;
    }

    if (isDirectNavigation.current) {
      isDirectNavigation.current = false;
      return;
    }

    searchParamsChanged.current = true;
    resetPagination();

    setPaginationLoading(true);
    mutate().finally(() => {
      setPaginationLoading(false);
    });
  }, [
    queryStates.q,
    queryStates.status,
    queryStates.product_id,
    queryStates.version,
    queryStates.none,
  ]);

  useEffect(() => {
    if (paginationFirstRender.current) {
      paginationFirstRender.current = false;
      return;
    }

    if (searchParamsChanged.current) {
      searchParamsChanged.current = false;
      if (queryStates.page === 1) {
        return;
      }
    }

    // For direct navigation or actual pagination, we fetch the data

    setPaginationLoading(true);
    mutate().finally(() => {
      setPaginationLoading(false);
    });
  }, [queryStates.page, queryStates.lastItemId]);

  const totalPages = Math.ceil((data?.totalCount || 0) / pageSize);

  if (isLoading || productsLoading) {
    return <LoadingScreen />;
  }

  const handleNextPage = async () => {
    if (totalPages == 0 || queryStates.page === totalPages) return;
    const lastItem = data?.customers[data?.customers.length - 1];

    setQueryStates({
      page: queryStates.page + 1,
      lastItemId: lastItem.internal_id, // This becomes the "cursor" for the next page
    });
  };

  const handlePreviousPage = async () => {
    if (queryStates.page === 1) return;
    // For previous page, we clear the lastItemId to force offset-based pagination
    setQueryStates({
      page: queryStates.page - 1,
      lastItemId: "",
    });
  };

  const handleFilterChange = (newFilters: any) => {
    const params: Record<string, string | number> = {
      page: 1,
      lastItemId: "",
    };

    if (newFilters?.status?.length > 0) {
      params.status = newFilters.status.join(",");
    } else {
      params.status = "";
    }

    // Handle new version-based filtering (productId:version format)
    if (newFilters?.version) {
      params.version = newFilters.version;
    } else {
      params.version = "";
    }

    // Legacy product_id support (keep for now)
    if (newFilters?.product_id?.length > 0) {
      params.product_id = newFilters.product_id.join(",");
    } else {
      params.product_id = "";
    }

    // Handle none filter
    if (newFilters?.none) {
      params.none = "true";
    } else {
      params.none = "";
    }

    setQueryStates(params);
    mutate();
  };

  return (
    <CustomersContext.Provider
      value={{
        customers: data?.customers,
        env,
        mutate,
        filters: {
          status: queryStates.status?.split(",").filter(Boolean) || [],
          product_id: queryStates.product_id?.split(",").filter(Boolean) || [],
          version: queryStates.version,
          none: queryStates.none === "true",
        },
        setFilters: handleFilterChange,
        products: productsData?.products,
        versionCounts: productsData?.versionCounts,
        setQueryStates,
        mutateSavedViews,
      }}
    >
      <div className="flex flex-col gap-4 h-fit relative w-full">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Customers</h1>
        <div>
          <div className="flex w-full justify-between sticky top-0 z-10 border-y  pl-10 pr-7 items-center bg-stone-100 h-10">
            <div className="flex items-center">
              <div className="pr-4 flex items-center justify-center gap-2 h-10">
                <FilterButton />
              </div>
              {/* {savedViewsData?.views?.length > 0 && (
                  <div className="border-r pr-4 pl-2 flex items-center">
                    <SavedViewsDropdown />
                  </div>
                )} */}

              <SearchBar
                query={queryStates.q || ""}
                setQuery={(query: string) => setQueryStates({ q: query })}
                setCurrentPage={(page: number) => {
                  setQueryStates({
                    page: page,
                    lastItemId: "",
                  });
                }}
                mutate={mutate}
                setSearching={setSearching}
              />
              <div className="w-[140px] flex justify-center items-center gap-8 text-xs text-t3 rounded-sm shrink-0 h-10  border-r">
                {paginationLoading && !searching ? (
                  <div className="h-8 flex items-center justify-center">
                    <SmallSpinner />
                  </div>
                ) : (
                  <Pagination className="w-fit h-8 text-xs">
                    <PaginationContent className="w-full flex justify-between ">
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={handlePreviousPage}
                          isActive={queryStates.page !== 1}
                          className="text-xs cursor-pointer p-1 h-6"
                        />
                      </PaginationItem>
                      <PaginationItem className="">
                        {queryStates.page} / {Math.max(totalPages, 1)}
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={handleNextPage}
                          isActive={queryStates.page !== totalPages}
                          className="text-xs cursor-pointer p-1 h-6"
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
              <div className="pl-4">
                <p className="text-t2 px-1 rounded-md bg-stone-200 text-sm">
                  {data?.totalCount}
                </p>
              </div>
              {/* <div className="h-10 flex items-center gap-2">
                <div className="border-r pr-4 flex items-center gap-2">
                  <FilterButton />
                  <p className="text-t2 px-1 rounded-md bg-stone-200 text-sm">
                    {data?.totalCount}
                  </p>
                </div>
                {savedViewsData?.views?.length > 0 && (
                  <div className="border-r pr-4 pl-2 flex items-center">
                    <SavedViewsDropdown />
                  </div>
                )}
              </div> */}
            </div>
            <div className="flex gap-4 bg-blue-100">
              <CreateCustomer />
            </div>
          </div>
          {data?.customers?.length > 0 ? (
            <div className="h-fit max-h-full">
              <CustomersTable customers={data.customers} />
            </div>
          ) : (
            <div className="flex flex-col px-10 mt-3 text-t3 text-sm w-full min-h-[60vh] gap-4">
              {/* <img
                src="./customer.png"
                alt="No customers"
                className="w-48 h-48 opacity-60 filter grayscale"
                // className="w-48 h-48 opacity-80 filter brightness-0 invert" // this is for dark mode
              /> */}
              <span>
                {
                  // Show loading state during search transitions to prevent flash of incorrect message

                  queryStates.q?.trim()
                    ? "No matching results found. Try a different search."
                    : "Create your first customer by interacting with an Autumn function via the API."
                }
              </span>
            </div>
          )}
        </div>
        {/* <div className="shrink-0 sticky bottom-0">
          <CreateCustomer />
        </div> */}
      </div>
    </CustomersContext.Provider>
  );
}

export default CustomersView;

{
  /* <p className="text-t3 text-sm whitespace-nowrap items-center flex gap-1">
              <span className="font-semibold">{data?.totalCount} </span>
              {data?.totalCount === 1 ? "Customer" : "Customers"}
            </p> */
}
