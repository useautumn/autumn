import type { CustomerWithProducts, MigrationFilter } from "@autumn/shared";
import {
	ArrowLeftIcon,
	CaretDownIcon,
	CaretLeftIcon,
	CaretRightIcon,
	EyeIcon,
	ListMagnifyingGlassIcon,
	PlayIcon,
	UsersIcon,
	WarningIcon,
	XIcon,
} from "@phosphor-icons/react";
import type { ColumnDef, PaginationState, Row } from "@tanstack/react-table";
import type { AxiosError } from "axios";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Table } from "@/components/general/table";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useMigrationFilterPreview } from "@/hooks/queries/useMigrationFilterPreview";
import {
	type MigrationItemEvent,
	useMigrationRunsQuery,
} from "@/hooks/queries/useMigrationRunsQuery";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";
import { createCustomerListColumns } from "@/views/customers2/components/table/customer-list/CustomerListColumns";
import { CustomerListFilterButton } from "@/views/customers2/components/table/customer-list/CustomerListFilterButton";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { ActiveRunDot, ItemEventStatusBadge } from "../runs/RunStatusBadge";
import {
	type ExecutionStatus,
	ExecutionStatusSubMenu,
	hasActiveExecutionFilters,
} from "./ExecutionStatusSubMenu";
import { useMigrationSheetStore } from "./useMigrationSheetStore";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 250];

type CustomerRow = CustomerWithProducts & {
	_event?: MigrationItemEvent;
	_isActive?: boolean;
};

function useConfirmAction(action: () => void) {
	const [isConfirming, setIsConfirming] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	const trigger = useCallback(() => {
		if (!isConfirming) {
			setIsConfirming(true);
			timerRef.current = setTimeout(() => setIsConfirming(false), 3000);
			return;
		}
		clearTimeout(timerRef.current);
		setIsConfirming(false);
		action();
	}, [isConfirming, action]);

	const cancel = useCallback(() => {
		clearTimeout(timerRef.current);
		setIsConfirming(false);
	}, []);

	return { isConfirming, trigger, cancel };
}

function buildEventsByCustomer(itemEvents: MigrationItemEvent[]) {
	const map = new Map<string, MigrationItemEvent>();
	for (const event of itemEvents) {
		if (event.item_kind !== "customer") continue;
		const existing = map.get(event.item_id);
		if (!existing || event.timestamp > existing.timestamp)
			map.set(event.item_id, event);
	}
	return map;
}

const statusColumn: ColumnDef<CustomerRow, unknown> = {
	id: "migration_status",
	header: "Status",
	size: 140,
	cell: ({ row }: { row: Row<CustomerRow> }) => {
		const event = row.original._event;
		if (event)
			return (
				<ItemEventStatusBadge
					status={event.status}
					dryRun={event.dry_run}
					response={event.response}
				/>
			);
		if (row.original._isActive)
			return (
				<div className="flex items-center gap-2">
					<ActiveRunDot />
					<span className="text-xs text-t2">Queued</span>
				</div>
			);
		return <Badge variant="muted">Not Run</Badge>;
	},
};

const baseColumns = createCustomerListColumns().filter(
	(col) => col.id !== "actions",
) as ColumnDef<CustomerRow, unknown>[];

const columns: ColumnDef<CustomerRow, unknown>[] = [
	...baseColumns,
	statusColumn,
];

export function MigrationLiveView({
	migrationId,
	filter,
	onPrevious,
}: {
	migrationId: string;
	filter: MigrationFilter;
	onPrevious?: () => void;
}) {
	const { runMigration, isRunning } = useMigrationsQuery();
	const { queryStates: customerFilters } = useCustomerFilters();
	const [executionStatuses, setExecutionStatuses] = useState<ExecutionStatus[]>(
		[],
	);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 50,
	});
	const [dismissedError, setDismissedError] = useState<string | null>(null);

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

	const {
		customers,
		count,
		isLoading: isLoadingCustomers,
	} = useMigrationFilterPreview({
		filter: filter.customer ?? {},
		search: debouncedSearch,
		page: pagination.pageIndex,
		pageSize: pagination.pageSize,
	});

	const {
		itemEvents,
		isActive,
		runs,
		invalidate: invalidateRuns,
	} = useMigrationRunsQuery({ migrationId });

	const setSelectedCustomer = useMigrationSheetStore(
		(s) => s.setSelectedCustomer,
	);

	const triggerRun = async (opts: {
		dryRun: boolean;
		limit?: number;
		only?: string[];
	}) => {
		try {
			const result = await runMigration({
				id: migrationId,
				dry_run: opts.dryRun,
				limit: opts.limit,
				only: opts.only,
			});
			toast.success(
				`${opts.dryRun ? "Dry run" : "Migration run"} triggered (${result.run_id})`,
			);
			invalidateRuns();
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to run migration"),
			);
		}
	};

	const confirm = useConfirmAction(() => triggerRun({ dryRun: false }));

	const eventsByCustomer = useMemo(
		() => buildEventsByCustomer(itemEvents),
		[itemEvents],
	);

	const enrichedCustomers = useMemo(
		(): CustomerRow[] =>
			customers.map((c) => ({
				...c,
				_event: eventsByCustomer.get(c.internal_id),
				_isActive: isActive,
			})),
		[customers, eventsByCustomer, isActive],
	);

	const filteredCustomers = useMemo(() => {
		const hasExecution = executionStatuses.length > 0;
		const hasStatus = customerFilters.status.length > 0;
		const hasVersion = customerFilters.version.length > 0;
		const hasProcessor = customerFilters.processor.length > 0;
		const hasNone = customerFilters.none;
		if (!hasExecution && !hasStatus && !hasVersion && !hasProcessor && !hasNone)
			return enrichedCustomers;
		return enrichedCustomers.filter((c) => {
			if (hasExecution) {
				const status = c._event?.status;
				if (!status && !executionStatuses.includes("not_run")) return false;
				if (status && !executionStatuses.includes(status as ExecutionStatus))
					return false;
			}
			const cusProducts = c.customer_products ?? [];
			if (hasNone && cusProducts.length === 0) return true;
			if (hasStatus) {
				if (
					!cusProducts.some((cp) => customerFilters.status.includes(cp.status))
				)
					return false;
			}
			if (hasVersion) {
				if (
					!cusProducts.some((cp) =>
						customerFilters.version.includes(
							`${cp.product?.id}:${cp.product?.version ?? 1}`,
						),
					)
				)
					return false;
			}
			if (hasProcessor) {
				const processors = c.processors ?? {};
				if (
					!customerFilters.processor.some(
						(p) => processors[p as keyof typeof processors] != null,
					)
				)
					return false;
			}
			return true;
		});
	}, [enrichedCustomers, executionStatuses, customerFilters]);

	const pageCount =
		count !== null ? Math.max(Math.ceil(count / pagination.pageSize), 1) : 1;

	const table = useProductTable<CustomerRow>({
		data: filteredCustomers,
		columns,
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

	const latestRun = runs[0];
	const latestFailedRun =
		latestRun?.status === "failed" && latestRun.error_message
			? latestRun
			: undefined;

	return (
		<div className="flex flex-col gap-4">
			{latestFailedRun && latestFailedRun.internal_id !== dismissedError && (
				<div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500">
					<WarningIcon size={14} weight="fill" className="shrink-0" />
					<span className="flex-1 min-w-0">
						Run failed: {latestFailedRun.error_message}
					</span>
					<button
						type="button"
						onClick={() => setDismissedError(latestFailedRun.internal_id)}
						className="shrink-0 opacity-70 hover:opacity-100"
					>
						<XIcon size={14} />
					</button>
				</div>
			)}

			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<UsersIcon size={16} weight="fill" className="text-subtle" />
					<span className="text-md font-medium text-t1">Execution</span>
					{count !== null && (
						<span className="text-xs text-t3">
							{count} {count === 1 ? "customer" : "customers"}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					{onPrevious && (
						<Button variant="secondary" size="default" onClick={onPrevious}>
							<ArrowLeftIcon size={14} />
							Previous
						</Button>
					)}
					<div className="flex items-center">
						<Button
							variant={confirm.isConfirming ? "destructive" : "primary"}
							size="default"
							className="rounded-r-none"
							onClick={confirm.trigger}
							onBlur={confirm.cancel}
							isLoading={isRunning}
						>
							{confirm.isConfirming ? (
								<WarningIcon size={14} weight="fill" />
							) : (
								<PlayIcon size={14} weight="fill" />
							)}
							{confirm.isConfirming ? "Confirm Run All" : "Run All"}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="primary"
									size="default"
									className="rounded-l-none border-l border-l-white/20 px-2"
								>
									<CaretDownIcon size={12} />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={4}>
								<DropdownMenuItem onClick={() => triggerRun({ dryRun: true })}>
									<EyeIcon size={14} />
									Dry Run All
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => triggerRun({ dryRun: false, limit: 10 })}
								>
									<PlayIcon size={14} weight="fill" />
									Sample (10)
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<CustomerListFilterButton
					extraMenuItems={
						<ExecutionStatusSubMenu
							selected={executionStatuses}
							onChange={setExecutionStatuses}
						/>
					}
					hasActiveExtraFilters={hasActiveExecutionFilters(executionStatuses)}
					onClearExtra={() => setExecutionStatuses([])}
					hideSavedViews
				/>
				<div className="relative flex items-center flex-1 min-w-0">
					<ListMagnifyingGlassIcon
						size={16}
						className="text-t3 absolute left-2.5 pointer-events-none"
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
					<span className="text-xs text-t2 font-medium">
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
					numberOfColumns: columns.length,
					enableSorting: false,
					isLoading: isLoadingCustomers,
					onRowClick: setSelectedCustomer,
					rowClassName: "h-10",
					emptyStateText: "No customers match this filter",
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
