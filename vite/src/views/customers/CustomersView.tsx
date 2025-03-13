"use client";

import React, { useEffect } from "react";
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
import { Toaster } from "@/components/ui/sonner";

function CustomersView({ env }: { env: AppEnv }) {
  // const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const pageSize = 50;
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filters, setFilters] = React.useState<any>({});
  // const [currentPage, setCurrentPage] = React.useState(1);
  // const [lastItemStack, setLastItemStack] = React.useState<any[]>([]);
  const [pagination, setPagination] = React.useState<{
    page: number;
    lastItemStack: any;
  }>({
    page: 1,
    lastItemStack: [],
  });
  const [paginationLoading, setPaginationLoading] = React.useState(false);

  const { data: productsData, isLoading: productsLoading } = useAxiosSWR({
    url: `/products/data`,
    env,
  });

  const { data, isLoading, error, mutate } = useAxiosPostSWR({
    url: `/v1/customers/search`,
    env,
    data: {
      page: pagination.page,
      page_size: pageSize,
      search: searchQuery,
      filters,
      last_item: pagination.lastItemStack[pagination.lastItemStack.length - 1],
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      setPaginationLoading(true);
      await mutate();
      setPaginationLoading(false);
    };
    fetchData();
  }, [pagination, filters, mutate]);

  // useEffect(() => {
  //   const updateFilters = async () => {
  //     setCurrentPage(1);
  //     await mutate();
  //     setLastItem(null);
  //   };
  //   updateFilters();
  // }, [filters]);

  const totalPages = Math.ceil((data?.totalCount || 0) / pageSize);

  if (isLoading || productsLoading) {
    return <LoadingScreen />;
  }

  const handleNextPage = async () => {
    if (pagination.page === totalPages) return;
    setPagination((prev) => {
      const lastItem = data?.customers[data?.customers.length - 1];
      const newItem = {
        created_at: lastItem.created_at,
        name: lastItem.name,
        internal_id: lastItem.internal_id,
      };

      const newLastItemStack = [...prev.lastItemStack, newItem];
      return {
        page: prev.page + 1,
        lastItemStack: newLastItemStack,
      };
    });
  };

  const handlePreviousPage = async () => {
    if (pagination.page === 1) return;
    const newLastItemStack = pagination.lastItemStack.slice(0, -1);
    setPagination({
      page: pagination.page - 1,
      lastItemStack: newLastItemStack,
    });
  };

  return (
    <CustomersContext.Provider
      value={{
        customers: data?.customers,
        env,
        mutate,
        filters,
        setFilters,
        products: productsData?.products,
      }}
    >
      <div className="flex flex-col gap-4 h-fit relative">
        <h1 className="text-xl font-medium shrink-0">Customers</h1>

        <div className="flex justify-between w-full sticky top-0 z-10">
          <div className="relative w-full max-w-md flex items-center gap-2">
            <SearchBar
              query={searchQuery}
              setQuery={setSearchQuery}
              setCurrentPage={(page: number) => {
                setPagination({
                  page: page,
                  lastItemStack: [],
                });
                mutate();
              }}
              mutate={mutate}
            />
            <FilterButton />
          </div>
          {data?.customers?.length > 0 && (
            <div className="flex items-center gap-8 text-xs border bg-white pr-1 pl-2 rounded-sm shrink-0">
              <p>
                <span className="font-semibold">{data?.totalCount} </span>
                {data?.totalCount === 1 ? "Customer" : "Customers"}
              </p>
              {paginationLoading ? (
                <div className="w-[120px] h-8 flex items-center justify-center">
                  <SmallSpinner />
                </div>
              ) : (
                <Pagination className="w-[120px] h-8 text-xs">
                  <PaginationContent className="w-full flex justify-between ">
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={handlePreviousPage}
                        isActive={pagination.page !== 1}
                        className="text-xs cursor-pointer p-1 h-6"
                      />
                    </PaginationItem>
                    <PaginationItem className="">
                      {pagination.page} / {totalPages}
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={handleNextPage}
                        isActive={pagination.page !== totalPages}
                        className="text-xs cursor-pointer p-1 h-6"
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </div>

        <div className="overflow-auto min-h-0">
          {data?.customers?.length > 0 ? (
            <div className="h-fit max-h-full">
              <CustomersTable customers={data.customers} />
            </div>
          ) : (
            <div className="flex bg-white shadow-md border rounded-md items-center justify-center text-t3 text-md h-[150px]">
              <span>You don&apos;t have any customers...yet</span>
            </div>
          )}
        </div>
        <div className="shrink-0 sticky bottom-0">
          <CreateCustomer />
        </div>
      </div>
    </CustomersContext.Provider>
  );
}

export default CustomersView;
