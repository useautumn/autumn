"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { AppEnv } from "@autumn/shared";
import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import { CustomersContext } from "./CustomersContext";
import { CustomToaster } from "@/components/general/CustomToaster";
import { CustomersTable } from "./CustomersTable";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import CreateCustomer from "./CreateCustomer";
import debounce from "lodash/debounce";
import { SearchBar } from "./SearchBar";
import LoadingScreen from "../general/LoadingScreen";

function CustomersView({ env }: { env: AppEnv }) {
  // const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const pageSize = 50;
  const [currentPage, setCurrentPage] = React.useState(1);
  const [searchQuery, setSearchQuery] = React.useState("");

  // url: debouncedSearch
  //   ? `/customers/search?search=${debouncedSearch}&page=${currentPage}`
  //   : `/customers?page=${currentPage}`,
  const { data, isLoading, error, mutate } = useAxiosPostSWR({
    url: `/customers/search`,
    env,
    data: {
      search: searchQuery,
      page: currentPage,
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      await mutate();
    };
    fetchData();
  }, [currentPage, mutate]);

  const totalPages = Math.ceil((data?.totalCount || 0) / pageSize);

  // return <LoadingScreen />;
  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <CustomersContext.Provider
      value={{ customers: data?.customers, env, mutate }}
    >
      <CustomToaster />
      <div className="flex flex-col gap-4 h-full">
        <h1 className="text-xl font-medium shrink-0">Customers</h1>

        <div className="flex justify-between w-full">
          <div className="relative shrink-0 w-full max-w-md">
            <SearchBar
              query={searchQuery}
              setQuery={setSearchQuery}
              setCurrentPage={setCurrentPage}
              mutate={mutate}
            />
          </div>
          {data?.customers?.length > 0 && (
            <div className="flex items-center gap-8 text-xs">
              <p>
                <span className="font-semibold">{data?.totalCount} </span>
                {data?.totalCount === 1 ? "Customer" : "Customers"}
              </p>
              <Pagination className="w-[100px] h-8 text-xs">
                <PaginationContent className="w-full flex justify-between ">
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        currentPage > 1 && setCurrentPage((p) => p - 1)
                      }
                      isActive={currentPage !== 1}
                      className="text-xs cursor-pointer p-1 h-6"
                    />
                  </PaginationItem>
                  <PaginationItem className="">
                    {currentPage} / {totalPages}
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        currentPage < totalPages && setCurrentPage((p) => p + 1)
                      }
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
        <div className="shrink-0">
          <CreateCustomer />
        </div>
      </div>
    </CustomersContext.Provider>
  );
}

export default CustomersView;
