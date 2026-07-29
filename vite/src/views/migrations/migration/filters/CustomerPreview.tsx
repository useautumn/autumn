import {
	AppEnv,
	type CustomerFilter,
	type CustomerWithProducts,
} from "@autumn/shared";
import { Separator } from "@autumn/ui";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { Table, useCursorPagination } from "@/components/general/table";
import { useMigrationFilterPreview } from "@/hooks/queries/useMigrationFilterPreview";
import { cn } from "@/lib/utils";
import { DEFAULT_CUSTOMER_LIST_PAGE_SIZE } from "@/utils/constants/customerListPagination";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { createCustomerListColumns } from "@/views/customers2/components/table/customer-list/CustomerListColumns";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { CustomerSearchToolbar } from "../shared/CustomerSearchToolbar";

const previewColumns = createCustomerListColumns()
	.filter((col) => col.id !== "actions")
	.map((column) => {
		if (column.id !== "name") return column;
		return {
			...column,
			cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
				const customer = row.original;
				const customerId = customer.id || customer.internal_id;
				return (
					<Link
						to={pushPage({
							path: `/customers/${customerId}`,
							preserveParams: false,
						})}
						onClick={(event) => event.stopPropagation()}
						className="group/link inline-flex max-w-full items-center gap-1.5 text-foreground hover:text-primary"
					>
						<span className="truncate font-medium">
							{customer.name || customerId}
						</span>
						<ArrowSquareOutIcon
							size={12}
							weight="bold"
							className="shrink-0 opacity-0 transition-opacity group-hover/link:opacity-70"
						/>
					</Link>
				);
			},
		} satisfies ColumnDef<CustomerWithProducts, unknown>;
	}) as ColumnDef<CustomerWithProducts, unknown>[];

export function CustomerPreview({ filter }: { filter: CustomerFilter }) {
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(search.trim());
	const [pageSize, setPageSize] = useState(DEFAULT_CUSTOMER_LIST_PAGE_SIZE);
	const cursorPagination = useCursorPagination({
		pageSize,
		resetKey: JSON.stringify({ filter, pageSize, search: search.trim() }),
	});
	const env = useEnv();

	const { count, customers, nextCursor, isLoading } = useMigrationFilterPreview(
		{
			filter,
			search: deferredSearch,
			cursor: cursorPagination.currentCursor,
			pageSize,
		},
	);

	const pageCount =
		count !== null ? Math.max(Math.ceil(count / pageSize), 1) : 1;

	const table = useProductTable<CustomerWithProducts>({
		data: customers,
		columns: previewColumns,
		options: {
			manualPagination: true,
			pageCount,
			state: { pagination: cursorPagination.pagination },
		},
	});

	return (
		<div className="flex flex-col gap-3">
			<Separator />
			<CustomerSearchToolbar
				search={search}
				onSearchChange={setSearch}
				count={count}
				pageSize={pageSize}
				onPageSizeChange={setPageSize}
				pagination={cursorPagination}
				nextCursor={nextCursor}
				isLoading={isLoading}
			/>
			<Table.Provider
				config={{
					table,
					numberOfColumns: previewColumns.length,
					enableSorting: false,
					isLoading: isLoading && customers.length === 0,
					rowClassName: "h-10",
					emptyStateText:
						count === 0 ? "No customers match this filter" : undefined,
				}}
			>
				<Table.Container>
					<Table.Content
						className={cn(
							"overflow-y-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-card",
							env === AppEnv.Sandbox
								? "max-h-[calc(100vh-425px)]"
								: "max-h-[calc(100vh-385px)]",
						)}
					>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
		</div>
	);
}

export function useCustomerCount(filter: CustomerFilter): number | null {
	const { count } = useMigrationFilterPreview({ filter, includeRows: false });
	return count;
}
