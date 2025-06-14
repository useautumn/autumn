import * as React from "react";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  HeaderGroup,
  Header,
  Row,
  Cell,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "lucide-react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading: boolean;
  pageInfo: {
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextCursor?: string;
    prevCursor?: string;
    page: number;
  };
  onSearch: (search: string) => void;
  onPaginate: (direction: "next" | "prev") => void;
  onSort: (sortKey: string, sortOrder: "asc" | "desc") => void;
  sortKey: string;
  sortOrder: "asc" | "desc";
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  pageInfo,
  onSearch,
  onPaginate,
  onSort,
}: DataTableProps<TData, TValue>) {
  const [search, setSearch] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, onSearch]);

  React.useEffect(() => {
    if (sorting.length > 0) {
      const sort = sorting[0];
      onSort(sort.id, sort.desc ? "desc" : "asc");
    }
  }, [sorting, onSort]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    manualSorting: true,
  });

  return (
    <div>
      <div className="flex items-center py-4">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border h-[250px] overflow-y-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header: Header<TData, unknown>) => {
                  const width = (header.column.columnDef as any).width;
                  return (
                    <TableHead
                      key={header.id}
                      style={width ? { width } : undefined}
                      onClick={() => {
                        if (header.column.getCanSort()) {
                          header.column.toggleSorting();
                        }
                      }}
                      className={
                        header.column.getCanSort()
                          ? "cursor-pointer select-none"
                          : ""
                      }
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted()
                        ? header.column.getIsSorted() === "asc"
                          ? " ▲"
                          : " ▼"
                        : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="text-xs">
            {isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="text-center h-[180px] "
                >
                  <span className="shimmer">Loading...</span>
                </TableCell>
              </TableRow>
            ) : data.length ? (
              table.getRowModel().rows.map((row: Row<TData>) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell: Cell<TData, unknown>) => {
                    return (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPaginate("prev")}
          disabled={pageInfo.page == 1}
        >
          Previous
        </Button>
        <span>Page {pageInfo.page}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPaginate("next")}
          disabled={!pageInfo.hasNextPage}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
