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
} from "@phosphor-icons/react";
import type { ColumnDef, PaginationState, Row } from "@tanstack/react-table";
import type { AxiosError } from "axios";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Table } from "@/components/general/table";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
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
import { ItemEventStatusBadge } from "../runs/RunStatusBadge";
import {
	type ExecutionStatus,
	ExecutionStatusSubMenu,
	hasActiveExecutionFilters,
} from "./ExecutionStatusSubMenu";

type RunFilter = "dry" | "live";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 250];

function useConfirmAction(action: () => void) {
	const [isConfirming, setIsConfirming] = useState(false);
	const timerRef = {
		current: undefined as ReturnType<typeof setTimeout> | undefined,
	};

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
	const [runFilter, setRunFilter] = useState<RunFilter>("dry");
	const [executionStatuses, setExecutionStatuses] = useState<ExecutionStatus[]>(
		[],
	);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 50,
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

	const customerFilter = filter.customer ?? {};
	const {
		customers,
		count,
		isLoading: isLoadingCustomers,
	} = useMigrationFilterPreview({
		filter: customerFilter,
		search: debouncedSearch,
		page: pagination.pageIndex,
		pageSize: pagination.pageSize,
	});

	const { itemEvents } = useMigrationRunsQuery({ migrationId });

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
			const label = opts.dryRun ? "Dry run" : "Migration run";
			toast.success(`${label} triggered (${result.run_id})`);
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to run migration"),
			);
		}
	};

	const confirm = useConfirmAction(() => triggerRun({ dryRun: false }));

	const isDryMode = runFilter === "dry";

	const eventsByCustomer = useMemo(() => {
		const map = new Map<string, MigrationItemEvent>();
		for (const event of itemEvents) {
			if (event.item_kind !== "customer") continue;
			if (isDryMode && !event.dry_run) continue;
			if (!isDryMode && event.dry_run) continue;
			const existing = map.get(event.item_id);
			if (!existing || event.timestamp > existing.timestamp) {
				map.set(event.item_id, event);
			}
		}
		return map;
	}, [itemEvents, isDryMode]);

	const [confirmCustomerId, setConfirmCustomerId] = useState<string | null>(
		null,
	);

	const runColumnForCustomer = (customerId: string) => {
		if (isDryMode) {
			triggerRun({ dryRun: true, only: [customerId] });
		} else {
			if (confirmCustomerId === customerId) {
				setConfirmCustomerId(null);
				triggerRun({ dryRun: false, only: [customerId] });
			} else {
				setConfirmCustomerId(customerId);
				setTimeout(() => setConfirmCustomerId(null), 3000);
			}
		}
	};

	const statusColumn: ColumnDef<CustomerWithProducts, unknown> = {
		id: "migration_status",
		header: "Status",
		size: 120,
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			const customerId = row.original.id ?? row.original.internal_id;
			const event = eventsByCustomer.get(customerId);
			if (!event) return <Badge variant="muted">Not Run</Badge>;
			return <ItemEventStatusBadge status={event.status} />;
		},
	};

	const runActionColumn: ColumnDef<CustomerWithProducts, unknown> = {
		id: "run_action",
		header: "",
		size: 80,
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			const customerId = row.original.id ?? row.original.internal_id;
			const isConfirming = !isDryMode && confirmCustomerId === customerId;
			return (
				<div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
					<Button
						variant={isConfirming ? "destructive" : "secondary"}
						size="sm"
						onClick={() => runColumnForCustomer(customerId)}
						isLoading={isRunning}
					>
						<PlayIcon size={10} weight="fill" />
						{isConfirming ? "Confirm" : "Run"}
					</Button>
				</div>
			);
		},
	};

	const filteredCustomers = useMemo(() => {
		const hasExecution = executionStatuses.length > 0;
		const hasStatus = customerFilters.status.length > 0;
		const hasVersion = customerFilters.version.length > 0;
		const hasProcessor = customerFilters.processor.length > 0;
		const hasNone = customerFilters.none;
		if (!hasExecution && !hasStatus && !hasVersion && !hasProcessor && !hasNone)
			return customers;
		return customers.filter((c) => {
			if (hasExecution) {
				const id = c.id ?? c.internal_id;
				const event = eventsByCustomer.get(id);
				if (!event && !executionStatuses.includes("not_run")) return false;
				if (
					event &&
					!executionStatuses.includes(event.status as ExecutionStatus)
				)
					return false;
			}
			const cusProducts = c.customer_products ?? [];
			if (hasNone && cusProducts.length === 0) return true;
			if (hasStatus) {
				const match = cusProducts.some((cp) =>
					customerFilters.status.includes(cp.status),
				);
				if (!match) return false;
			}
			if (hasVersion) {
				const match = cusProducts.some((cp) => {
					const key = `${cp.product?.id}:${cp.product?.version ?? 1}`;
					return customerFilters.version.includes(key);
				});
				if (!match) return false;
			}
			if (hasProcessor) {
				const processors = c.processors ?? {};
				const match = customerFilters.processor.some(
					(p) => processors[p as keyof typeof processors] != null,
				);
				if (!match) return false;
			}
			return true;
		});
	}, [customers, eventsByCustomer, executionStatuses, customerFilters]);

	const columns = useMemo(
		(): ColumnDef<CustomerWithProducts, unknown>[] => [
			...(createCustomerListColumns().filter(
				(col) => col.id !== "actions",
			) as ColumnDef<CustomerWithProducts, unknown>[]),
			statusColumn,
			runActionColumn,
		],
		[eventsByCustomer, isDryMode, isRunning, confirmCustomerId],
	);

	const pageCount =
		count !== null ? Math.max(Math.ceil(count / pagination.pageSize), 1) : 1;

	const table = useProductTable<CustomerWithProducts>({
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

	return (
		<div className="flex flex-col gap-4">
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
				<GroupedTabButton
					value={runFilter}
					onValueChange={(v) => setRunFilter(v as RunFilter)}
					options={[
						{ value: "dry", label: "Dry Run" },
						{ value: "live", label: "Live" },
					]}
				/>
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
