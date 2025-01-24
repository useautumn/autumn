"use client";

import { AppEnv, Customer } from "@autumn/shared";
import React from "react";
import CreateCustomer from "./CreateCustomer";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { CustomersContext } from "./CustomersContext";
import Link from "next/link";
import { CustomToaster } from "@/components/general/CustomToaster";
import { CustomersTable } from "./CustomersTable";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

function CustomersView({ env }: { env: AppEnv }) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 50;

  // Add debouncing effect
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200); // 300ms delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading,  error, mutate } = useAxiosSWR({
    url: debouncedSearch 
      ? `/customers/search?search=${debouncedSearch}&page=${currentPage}` 
      : `/customers?page=${currentPage}`,
    env,
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / pageSize);

  return (
    <CustomersContext.Provider value={{ customers: data?.customers, env, mutate }}>
      <CustomToaster />
      <div className="flex flex-col gap-4 h-full">
        <h1 className="text-xl font-medium shrink-0">Customers</h1>
        
        <div className="flex justify-between w-full">
          <div className="relative shrink-0 w-full max-w-md">
          <Input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="pr-8 max-w-md"
            endContent={isLoading && (
              <div className="absolute right-2 top-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          />
          </div>
           <div className="">
             <Pagination className="w-[100px] h-8 text-xs">
                    <PaginationContent className="w-full flex justify-between ">
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => currentPage > 1 && setCurrentPage(p => p - 1)}
                          isActive={currentPage !== 1}
                          className="text-xs cursor-pointer p-1 h-6"
                        />
                      </PaginationItem>
                      <PaginationItem className="">
                          {currentPage} / {totalPages}
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => currentPage < totalPages && setCurrentPage(p => p + 1)}
                          isActive={currentPage !== totalPages}
                          className="text-xs cursor-pointer p-1 h-6"
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
           </div>
        </div>

        <div className="overflow-auto min-h-0">
          {data?.customers?.length > 0 ? (
            <div className="h-fit max-h-full">
              <CustomersTable customers={data.customers} />
              <div className="mt-4 flex justify-center">
               
              </div>
            </div>
          ) : (
            <div className="flex flex-col text-center text-t3">
              <span>You don&apos;t have any customers</span>
              <span className="text-t3 text-sm">...yet</span>
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
