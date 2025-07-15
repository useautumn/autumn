import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { useAnalyticsContext } from "../AnalyticsContext";
import { AgGridReact } from "ag-grid-react";
import { useRawAnalyticsData } from "../hooks/useAnalyticsData";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paginationOptions } from "./AGGrid";

export default function PaginationPanel() {
  const {
    gridRef,
    pageSize,
    setPageSize,
    currentPage,
    totalPages,
    totalRows,
  }: {
    gridRef: React.RefObject<AgGridReact>;
    pageSize: number;
    setPageSize: (size: number) => void;
    currentPage: number;
    totalPages: number;
    totalRows: number;
  } = useAnalyticsContext();
  const { queryLoading } = useRawAnalyticsData();

  const handlePageChange = (page: number) => {
    if (gridRef.current) gridRef.current.api.paginationGoToPage(page);
  };

  const handlePreviousPage = () => {
    const api = gridRef.current?.api;
    if (api) {
      const currentPage = api.paginationGetCurrentPage();
      if (currentPage > 0) {
        handlePageChange(currentPage - 1);
      }
    }
  };

  const handleNextPage = () => {
    const api = gridRef.current?.api;
    if (api) {
      const currentPage = api.paginationGetCurrentPage();
      const totalPages = api.paginationGetTotalPages();
      if (currentPage < totalPages - 1) {
        handlePageChange(currentPage + 1);
      }
    }
  };

  // If grid is not initialized yet or loading, show a simplified version
  if (!gridRef.current?.api || queryLoading) {
    return (
      <div className="flex items-center py-0 h-full">
        <Pagination className="w-fit h-8 text-xs">
          <PaginationContent className="w-full flex justify-between">
            <PaginationItem>
              <PaginationPrevious className="text-xs cursor-not-allowed opacity-50 p-1 h-6" />
            </PaginationItem>
            <PaginationItem className="">
              {queryLoading ? (
                <span className="shimmer">Loading...</span>
              ) : (
                "0 / 0"
              )}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext className="text-xs cursor-not-allowed opacity-50 p-1 h-6" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  }

  return (
    <div className="flex items-center py-0 h-full select-none">
      <div className="flex items-center mr-3 text-xs text-t2">
        <span>{totalRows} events</span>
      </div>
      
      <Button variant="outline" className="px-2 bg-white h-full select-none hover:bg-white border-y-0">
        <Pagination className="w-fit h-full text-xs select-none">
          <PaginationContent className="w-full flex justify-between select-none">
            <PaginationItem className="select-none">
              <PaginationPrevious
                onClick={handlePreviousPage}
                isActive={currentPage !== 1}
                className="text-xs cursor-pointer p-1 h-6 select-none"
              />
            </PaginationItem>
            <PaginationItem className="select-none">
              {currentPage} / {totalPages}
            </PaginationItem>
            <PaginationItem className="select-none">
              <PaginationNext
                onClick={handleNextPage}
                isActive={currentPage !== totalPages}
                className="text-xs cursor-pointer p-1 h-6 select-none"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="ml-2 select-none h-full border-y-0"
          >
            {pageSize} <ChevronDown className="w-4 h-4 ml-1 select-none" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-full select-none">
          <DropdownMenuLabel className="select-none">
            Page Size
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {paginationOptions.map((size) => (
            <DropdownMenuItem
              key={size}
              onClick={() => {
                if (gridRef.current?.api) {
                  setPageSize(size);
                }
              }}
              className="select-none"
            >
              {size}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
