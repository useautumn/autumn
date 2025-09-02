import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useCustomersQueryStates } from "../hooks/useCustomersQueryStates";
import SmallSpinner from "@/components/general/SmallSpinner";
import { useCusSearchQuery } from "../hooks/useCusSearchQuery";

export const CustomersPagination = () => {
  const { isLoading, totalCount } = useCusSearchQuery();
  const { queryStates, setQueryStates } = useCustomersQueryStates();

  const totalPages = Math.ceil((totalCount || 0) / 50);
  const currentPage = Number(queryStates.page) || 1;
  const canGoPrev = currentPage > 1;
  return (
    <div className="w-[140px] flex justify-center items-center gap-8 text-xs text-t3 rounded-sm shrink-0 h-10  border-r select-none">
      {isLoading ? (
        <div className="h-8 flex items-center justify-center">
          <SmallSpinner />
        </div>
      ) : (
        <Pagination className="w-fit h-8 text-xs">
          <PaginationContent className="w-full flex justify-between ">
            <PaginationItem>
              <PaginationPrevious
                onClick={async (e) => {
                  e.preventDefault();
                  if (!canGoPrev) return;
                  await setQueryStates({
                    page: currentPage - 1,
                  });
                }}
                isActive={canGoPrev}
                aria-disabled={!canGoPrev}
                className={`text-xs cursor-pointer p-1 h-6 ${!canGoPrev ? "pointer-events-none opacity-50" : ""}`}
              />
            </PaginationItem>
            <PaginationItem className="">
              {currentPage} / {Math.max(totalPages, 1)}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={async (e) => {
                  e.preventDefault();
                  await setQueryStates({
                    page: currentPage + 1,
                  });
                }}
                isActive={currentPage > totalPages}
                aria-disabled={currentPage === totalPages}
                className={`text-xs cursor-pointer p-1 h-6 ${currentPage === totalPages ? "pointer-events-none opacity-50" : ""}`}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
};
