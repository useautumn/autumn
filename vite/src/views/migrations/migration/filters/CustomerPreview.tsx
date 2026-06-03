import type { CustomerFilter, CustomerWithProducts } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	CaretLeftIcon,
	CaretRightIcon,
	ListMagnifyingGlassIcon,
} from "@phosphor-icons/react";
import type { ColumnDef, PaginationState, Row } from "@tanstack/react-table";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { Separator } from "@/components/v2/separator";
import { useMigrationFilterPreview } from "@/hooks/queries/useMigrationFilterPreview";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { createCustomerListColumns } from "@/views/customers2/components/table/customer-list/CustomerListColumns";
import { useProductTable } from "@/views/products/hooks/useProductTable";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 250];

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
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const debouncedSetSearch = useMemo(
		() => debounce((q: string) => setDebouncedSearch(q), 350),
		[],
	);

	useEffect(() => () => debouncedSetSearch.cancel(), [debouncedSetSearch]);

	const handleSearchChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setSearch(e.target.value);
			setPagination((p) => ({ ...p, pageIndex: 0 }));
			debouncedSetSearch(e.target.value.trim());
		},
		[debouncedSetSearch],
	);

	const filterKey = useMemo(() => JSON.stringify(filter), [filter]);
	useEffect(() => {
		setPagination((p) => ({ ...p, pageIndex: 0 }));
	}, [filterKey]);

	const { count, customers, isLoading } = useMigrationFilterPreview({
		filter,
		search: debouncedSearch,
		page: pagination.pageIndex,
		pageSize: pagination.pageSize,
	});

	const pageCount =
		count !== null ? Math.max(Math.ceil(count / pagination.pageSize), 1) : 1;

	const table = useProductTable<CustomerWithProducts>({
		data: customers,
		columns: previewColumns,
		options: {
			manualPagination: true,
			pageCount,
			state: { pagination },
			onPaginationChange: setPagination,
		},
	});

	const currentPage = pagination.pageIndex + 1;
	const canPrev = pagination.pageIndex > 0;
	const canNext = count !== null && currentPage < pageCount;

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
						onChange={handleSearchChange}
						className="pl-8! text-sm"
						placeholder={`Search ${count ?? 0} customers`}
					/>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretLeftIcon size={12} weight="bold" />}
						onClick={() =>
							setPagination((p) => ({ ...p, pageIndex: p.pageIndex - 1 }))
						}
						disabled={!canPrev}
						className={cn(!canPrev && "pointer-events-none opacity-50")}
					/>
					<span className="text-xs text-muted-foreground font-medium">
						{currentPage} / {pageCount}
					</span>
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretRightIcon size={12} weight="bold" />}
						onClick={() =>
							setPagination((p) => ({ ...p, pageIndex: p.pageIndex + 1 }))
						}
						disabled={!canNext}
						className={cn(!canNext && "pointer-events-none opacity-50")}
					/>
					<Select
						value={pagination.pageSize.toString()}
						onValueChange={(v) =>
							setPagination({ pageIndex: 0, pageSize: Number(v) })
						}
						items={Object.fromEntries(
							PAGE_SIZE_OPTIONS.map((s) => [s.toString(), s.toString()]),
						)}
					>
						<SelectTrigger className="h-7 w-fit px-2 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PAGE_SIZE_OPTIONS.map((s) => (
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
	const { count } = useMigrationFilterPreview({ filter });
	return count;
}
