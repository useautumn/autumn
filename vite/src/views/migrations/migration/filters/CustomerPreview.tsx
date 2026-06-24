import type { CustomerFilter, CustomerWithProducts } from "@autumn/shared";
import {
	IconButton,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
} from "@autumn/ui";
import {
	ArrowSquareOutIcon,
	CaretLeftIcon,
	CaretRightIcon,
	ListMagnifyingGlassIcon,
} from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { Table } from "@/components/general/table";
import { useCursorPagination } from "@/components/general/table";
import { useMigrationFilterPreview } from "@/hooks/queries/useMigrationFilterPreview";
import { cn } from "@/lib/utils";
import {
	CUSTOMER_LIST_PAGE_SIZE_OPTIONS,
	DEFAULT_CUSTOMER_LIST_PAGE_SIZE,
} from "@/utils/constants/customerListPagination";
import { pushPage } from "@/utils/genUtils";
import { createCustomerListColumns } from "@/views/customers2/components/table/customer-list/CustomerListColumns";
import { useProductTable } from "@/views/products/hooks/useProductTable";

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
	const {
		currentCursor,
		currentPage,
		pagination,
		canPrev,
		pushCursor,
		popCursor,
	} = useCursorPagination({
		pageSize,
		resetKey: JSON.stringify({ filter, pageSize, search: search.trim() }),
	});

	const { count, customers, nextCursor, isLoading } = useMigrationFilterPreview(
		{
			filter,
			search: deferredSearch,
			cursor: currentCursor,
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
			state: { pagination },
		},
	});
	const canGoNext = Boolean(nextCursor);
	const isDisabled = isLoading;

	return (
		<div className="flex flex-col gap-3">
			<Separator />
			<div className="flex items-center gap-2">
				<div className="relative flex items-center flex-1 min-w-0">
					<ListMagnifyingGlassIcon
						size={16}
						className="text-tertiary-foreground absolute left-2.5 pointer-events-none"
					/>
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-8! text-sm"
						placeholder={`Search ${count ?? 0} customers`}
					/>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretLeftIcon size={12} weight="bold" />}
						onClick={popCursor}
						disabled={isDisabled || !canPrev}
						className={cn(
							(isDisabled || !canPrev) && "pointer-events-none opacity-50",
						)}
					/>
					<span className="text-xs text-muted-foreground font-medium">
						{currentPage} / {pageCount}
					</span>
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretRightIcon size={12} weight="bold" />}
						onClick={() => nextCursor && pushCursor(nextCursor)}
						disabled={isDisabled || !canGoNext}
						className={cn(
							(isDisabled || !canGoNext) && "pointer-events-none opacity-50",
						)}
					/>
					<Select
						value={pageSize.toString()}
						onValueChange={(v) => {
							setPageSize(Number(v));
						}}
						items={Object.fromEntries(
							CUSTOMER_LIST_PAGE_SIZE_OPTIONS.map((s) => [
								s.toString(),
								s.toString(),
							]),
						)}
					>
						<SelectTrigger className="h-7 w-fit px-2 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CUSTOMER_LIST_PAGE_SIZE_OPTIONS.map((s) => (
								<SelectItem key={s} value={s.toString()}>
									{s}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
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
					<Table.Content>
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
