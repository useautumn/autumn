"use client";

import React, { useEffect } from "react";
import { AppEnv } from "@autumn/shared";
import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import { CustomersContext } from "./CustomersContext";
import { CustomToaster } from "@/components/general/CustomToaster";
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

function CustomersView({ env }: { env: AppEnv }) {
  // const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const pageSize = 50;
  const [currentPage, setCurrentPage] = React.useState(1);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filters, setFilters] = React.useState<any>({});
  const [lastItemStack, setLastItemStack] = React.useState<any[]>([]);
  // url: debouncedSearch
  //   ? `/customers/search?search=${debouncedSearch}&page=${currentPage}`
  //   : `/customers?page=${currentPage}`,
  // Get products

  const { data: productsData, isLoading: productsLoading } = useAxiosSWR({
    url: `/products/data`,
    env,
  });

  const { data, isLoading, error, mutate } = useAxiosPostSWR({
    url: `/customers/search`,
    env,
    data: {
      page: currentPage,
      search: searchQuery,
      filters,
      last_item: lastItemStack[lastItemStack.length - 1],
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      // If filters changed (not on mount), reset to page 1 and clear lastItem
      if (Object.keys(filters).length > 0) {
        setCurrentPage(1);
        setLastItemStack([]);
      }
      await mutate();
    };
    fetchData();
  }, [currentPage, filters, mutate]);

  // useEffect(() => {
  //   const fetchData = async () => {
  //     await mutate();
  //   };
  //   fetchData();
  // }, [currentPage, mutate]);

  // useEffect(() => {
  //   const updateFilters = async () => {
  //     setCurrentPage(1);
  //     await mutate();
  //     setLastItem(null);
  //   };
  //   updateFilters();
  // }, [filters]);

  const totalPages = Math.ceil((data?.totalCount || 0) / pageSize);

  // return <LoadingScreen />;
  if (isLoading || productsLoading) {
    return <LoadingScreen />;
  }

  const handleNextPage = () => {
    const lastItem = data?.customers[data?.customers.length - 1];
    const newLastItemStack = [...lastItemStack, lastItem];
    setLastItemStack(newLastItemStack);
    setCurrentPage(currentPage + 1);
  };

  const handlePreviousPage = () => {
    const newLastItemStack = lastItemStack.slice(0, -1);
    setLastItemStack(newLastItemStack);
    setCurrentPage(currentPage - 1);
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
      <CustomToaster />
      <div className="flex flex-col gap-4 h-fit relative">
        <h1 className="text-xl font-medium shrink-0">Customers</h1>

        <div className="flex justify-between w-full sticky top-0 z-10">
          <div className="relative w-full max-w-md flex items-center gap-2">
            <SearchBar
              query={searchQuery}
              setQuery={setSearchQuery}
              setCurrentPage={setCurrentPage}
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
              <Pagination className="w-[100px] h-8 text-xs">
                <PaginationContent className="w-full flex justify-between ">
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={handlePreviousPage}
                      isActive={currentPage !== 1}
                      className="text-xs cursor-pointer p-1 h-6"
                    />
                  </PaginationItem>
                  <PaginationItem className="">
                    {currentPage} / {totalPages}
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={handleNextPage}
                      isActive={currentPage !== totalPages}
                      className="text-xs cursor-pointer p-1 h-6"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
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
