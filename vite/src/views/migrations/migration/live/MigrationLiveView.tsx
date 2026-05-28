import type {
	CustomerWithProducts,
	MigrationFilter,
	Operations,
} from "@autumn/shared";
import {
	ArrowLeftIcon,
	ArrowSquareOutIcon,
	CaretDownIcon,
	CaretLeftIcon,
	CaretRightIcon,
	CheckIcon,
	EyeIcon,
	ListMagnifyingGlassIcon,
	PlayIcon,
	StopIcon,
	UsersIcon,
	WarningIcon,
	XIcon,
} from "@phosphor-icons/react";
import type { ColumnDef, PaginationState, Row } from "@tanstack/react-table";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Table } from "@/components/general/table";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
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
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { toast } from "sonner";
import {
	type MigrationItemEvent,
	useMigrationRunsQuery,
} from "@/hooks/queries/useMigrationRunsQuery";
import { cn } from "@/lib/utils";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";
import { createCustomerListColumns } from "@/views/customers2/components/table/customer-list/CustomerListColumns";
import { CustomerListFilterButton } from "@/views/customers2/components/table/customer-list/CustomerListFilterButton";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { pushPage } from "@/utils/genUtils";
import { useRealtimeSubscriptions } from "../hooks/useRealtimeSubscriptions";
import { ItemEventStatusBadge } from "../runs/RunStatusBadge";
import { type StepId, StepIndicator } from "../StepIndicator";
import { RunSummaryRows } from "../shared/RunSummaryRows";
import { ActiveDot } from "./ActiveDot";
import {
	type ExecutionStatus,
	ExecutionStatusSubMenu,
	hasActiveExecutionFilters,
} from "./ExecutionStatusSubMenu";
import { RealtimeRunWatcher } from "./RealtimeRunWatcher";
import { useMigrationSheetStore } from "./useMigrationSheetStore";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 250];

type ActiveRunStatus = "queued" | "running" | null;

type CustomerRow = CustomerWithProducts & {
	_event?: MigrationItemEvent;
	_activeStatus?: ActiveRunStatus;
	_activeRunId?: string;
};

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
		const activeStatus = row.original._activeStatus;
		const activeRunId = row.original._activeRunId;
		const processedInCurrentRun =
			event && activeRunId && event.migration_run_id === activeRunId;

		if (activeStatus && !processedInCurrentRun) {
			const color = activeStatus === "running" ? "green" : "orange";
			const label = activeStatus === "running" ? "Running" : "Queued";
			return (
				<Badge variant="muted" className="gap-1.5">
					<ActiveDot color={color} />
					{label}
				</Badge>
			);
		}

		if (event)
			return (
				<ItemEventStatusBadge
					status={event.status}
					dryRun={event.dry_run}
					response={event.response}
				/>
			);

		return <Badge variant="muted">Not Run</Badge>;
	},
};

const baseColumns = createCustomerListColumns().filter(
	(col) => col.id !== "actions",
) as ColumnDef<CustomerRow, unknown>[];

const executionCustomerColumns = baseColumns.map((column) => {
	if (column.id !== "name") return column;

	return {
		...column,
		cell: ({ row }: { row: Row<CustomerRow> }) => {
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
	} satisfies ColumnDef<CustomerRow, unknown>;
});

const columns: ColumnDef<CustomerRow, unknown>[] = [
	...executionCustomerColumns,
	statusColumn,
];

export function MigrationLiveView({
	migrationId,
	filter,
	operations,
	noBillingChanges,
	step,
	onStepChange,
	onPrevious,
}: {
	migrationId: string;
	filter: MigrationFilter;
	operations: Operations;
	noBillingChanges: boolean;
	step: StepId;
	onStepChange: (step: StepId) => void;
	onPrevious?: () => void;
}) {
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
	const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
	const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
	const [sample, setSample] = useState({
		open: false,
		mode: "limit" as "limit" | "select",
		limit: "10",
		customerIds: [] as string[],
		running: null as "dry" | "live" | null,
	});
	const { cancelRun, isCanceling } = useMigrationsQuery();

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
		runs,
		invalidate: invalidateRuns,
	} = useMigrationRunsQuery({ migrationId });

	const {
		subscriptions: realtimeSubscriptions,
		hasActive: hasRealtimeActive,
		handleComplete: handleRealtimeComplete,
		triggerRun,
		isRunning,
	} = useRealtimeSubscriptions({ migrationId, invalidateRuns });

	const setSelectedCustomer = useMigrationSheetStore(
		(s) => s.setSelectedCustomer,
	);

	const eventsByCustomer = useMemo(
		() => buildEventsByCustomer(itemEvents),
		[itemEvents],
	);

	const activeRun = runs.find(
		(r) => r.status === "queued" || r.status === "running",
	);
	const activeRunStatus: ActiveRunStatus = hasRealtimeActive
		? "running"
		: ((activeRun?.status as ActiveRunStatus) ?? null);
	const activeRunId = activeRun?.internal_id ?? null;
	const activeRunOnlyIds = useMemo(
		() =>
			activeRun?.only_ids && activeRun.only_ids.length > 0
				? new Set(activeRun.only_ids)
				: null,
		[activeRun?.only_ids],
	);
	const isActiveRunScoped =
		!!activeRunOnlyIds || !!(activeRun?.target_limit as number | null);

	const enrichedCustomers = useMemo(
		(): CustomerRow[] =>
			customers.map((c) => {
				const event = eventsByCustomer.get(c.internal_id);
				const hasEventInActiveRun =
					event && activeRunId && event.migration_run_id === activeRunId;
				const isTargeted = activeRunOnlyIds
					? activeRunOnlyIds.has(c.id ?? "") ||
						activeRunOnlyIds.has(c.internal_id)
					: isActiveRunScoped
						? !!hasEventInActiveRun
						: true;
				return {
					...c,
					_event: event,
					_activeStatus: isTargeted ? activeRunStatus : null,
					_activeRunId: activeRunId ?? undefined,
				};
			}),
		[
			customers,
			eventsByCustomer,
			activeRunStatus,
			activeRunId,
			activeRunOnlyIds,
			isActiveRunScoped,
		],
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
			{realtimeSubscriptions.map((sub) => (
				<RealtimeRunWatcher
					key={sub.triggerRunId}
					subscription={sub}
					onComplete={handleRealtimeComplete}
				/>
			))}
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

			<StepIndicator step={step} onStepChange={onStepChange}>
				{onPrevious && (
					<Button variant="secondary" size="default" onClick={onPrevious}>
						<ArrowLeftIcon size={14} />
						Previous
					</Button>
				)}
				{activeRun && (
					<Button
						variant="secondary"
						size="default"
						onClick={() => setIsCancelDialogOpen(true)}
						isLoading={isCanceling}
					>
						<StopIcon size={14} weight="fill" />
						Cancel run
					</Button>
				)}
				<div className="flex items-center">
					<Button
						variant="primary"
						size="default"
						className="rounded-r-none border-r-0"
						onClick={() => setIsRunDialogOpen(true)}
						isLoading={isRunning}
					>
						<PlayIcon size={14} weight="fill" />
						Run All
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
								onClick={() => setSample((s) => ({ ...s, open: true }))}
							>
								<PlayIcon size={14} weight="fill" />
								Run Sample
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<Dialog
					open={isCancelDialogOpen}
					onOpenChange={setIsCancelDialogOpen}
				>
					<DialogContent showCloseButton={false}>
						<DialogHeader>
							<DialogTitle>Cancel running migration?</DialogTitle>
							<DialogDescription>
								This stops the active run. Customers already processed in this
								run will keep their migrated state — only pending customers are
								affected.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="secondary"
								onClick={() => setIsCancelDialogOpen(false)}
							>
								Keep running
							</Button>
							<Button
								variant="primary"
								isLoading={isCanceling}
								onClick={async () => {
									try {
										await cancelRun({ id: migrationId });
										toast.success("Migration run canceled");
										invalidateRuns();
									} catch {
										toast.error("Failed to cancel migration run");
									} finally {
										setIsCancelDialogOpen(false);
									}
								}}
							>
								<StopIcon size={14} weight="fill" />
								Cancel run
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Dialog open={isRunDialogOpen} onOpenChange={setIsRunDialogOpen}>
					<DialogContent showCloseButton={false}>
						<DialogHeader>
							<DialogTitle>Run Migration</DialogTitle>
							<DialogDescription>
								This will apply the migration to the following scope.
							</DialogDescription>
						</DialogHeader>
						<RunSummaryRows
							customerIcon={
								<UsersIcon
									size={14}
									weight="duotone"
									className="text-blue-500"
								/>
							}
							customerLabel={
								count !== null
									? `${count} ${count === 1 ? "customer" : "customers"}`
									: "All matched customers"
							}
							operations={operations}
							noBillingChanges={noBillingChanges}
						/>
						<DialogFooter>
							<Button
								variant="secondary"
								onClick={() => setIsRunDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button
								variant="primary"
								onClick={() => {
									setIsRunDialogOpen(false);
									triggerRun({ dryRun: false });
								}}
							>
								<PlayIcon size={14} weight="fill" />
								Run
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Dialog
					open={sample.open}
					onOpenChange={(open) => setSample((s) => ({ ...s, open }))}
				>
					<DialogContent showCloseButton={false}>
						<DialogHeader>
							<DialogTitle>Run Sample</DialogTitle>
							<DialogDescription>
								Run the migration on a subset of customers.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-3">
							<div className="flex border-b border-border">
								<button
									type="button"
									onClick={() =>
										setSample((s) => ({ ...s, mode: "limit" }))
									}
									className={cn(
										"flex-1 pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
										sample.mode === "limit"
											? "border-primary text-foreground"
											: "border-transparent text-tertiary-foreground hover:text-muted-foreground",
									)}
								>
									By count
								</button>
								<button
									type="button"
									onClick={() =>
										setSample((s) => ({ ...s, mode: "select" }))
									}
									className={cn(
										"flex-1 pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
										sample.mode === "select"
											? "border-primary text-foreground"
											: "border-transparent text-tertiary-foreground hover:text-muted-foreground",
									)}
								>
									Select customers
								</button>
							</div>
							<div className="min-h-[220px]">
								{sample.mode === "limit" ? (
									<div className="flex flex-col gap-1.5">
										<label className="text-xs text-tertiary-foreground">
											Number of customers
										</label>
										<Input
											type="number"
											min={1}
											value={sample.limit}
											onChange={(e) =>
												setSample((s) => ({
													...s,
													limit: e.target.value,
												}))
											}
											placeholder="10"
										/>
										<SampleCustomerPreview
											customers={enrichedCustomers}
											limit={Number(sample.limit) || 0}
										/>
										<span className="text-xs text-tertiary-foreground">
											{Math.min(
												Number(sample.limit) || 0,
												enrichedCustomers.filter((c) => !c._event).length,
											)}{" "}
											customers
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-1.5">
										<label className="text-xs text-tertiary-foreground">
											Select customers to run
										</label>
										<SampleCustomerPicker
											customers={enrichedCustomers}
											selectedIds={sample.customerIds}
											onChange={(ids) =>
												setSample((s) => ({ ...s, customerIds: ids }))
											}
										/>
									</div>
								)}
							</div>
						</div>
						<DialogFooter className="sm:flex-col gap-2">
							<ShortcutButton
								className="w-full"
								variant="secondary"
								isLoading={sample.running === "dry"}
								disabled={
									sample.running !== null ||
									(sample.mode === "limit"
										? !sample.limit || Number(sample.limit) < 1
										: sample.customerIds.length === 0)
								}
								onClick={async () => {
									setSample((s) => ({ ...s, running: "dry" }));
									if (sample.mode === "limit") {
										const topIds = enrichedCustomers
											.filter((c) => !c._event)
											.slice(0, Number(sample.limit))
											.map((c) => c.id ?? c.internal_id);
										await triggerRun({
											dryRun: true,
											only: topIds,
										});
									} else {
										await triggerRun({
											dryRun: true,
											only: sample.customerIds,
										});
									}
									setSample((s) => ({ ...s, running: null, open: false }));
								}}
							>
								<EyeIcon size={14} />
								Dry Run{" "}
								{sample.mode === "limit"
									? `(${sample.limit || 0})`
									: `(${sample.customerIds.length})`}
							</ShortcutButton>
							<ShortcutButton
								className="w-full"
								metaShortcut="enter"
								isLoading={sample.running === "live"}
								disabled={
									sample.running !== null ||
									(sample.mode === "limit"
										? !sample.limit || Number(sample.limit) < 1
										: sample.customerIds.length === 0)
								}
								onClick={async () => {
									setSample((s) => ({ ...s, running: "live" }));
									if (sample.mode === "limit") {
										await triggerRun({
											dryRun: false,
											limit: Number(sample.limit),
										});
									} else {
										await triggerRun({
											dryRun: false,
											only: sample.customerIds,
										});
									}
									setSample((s) => ({ ...s, running: null, open: false }));
								}}
							>
								<PlayIcon size={14} weight="fill" />
								Run Live{" "}
								{sample.mode === "limit"
									? `(${sample.limit || 0})`
									: `(${sample.customerIds.length})`}
							</ShortcutButton>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</StepIndicator>

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

function SampleCustomerPreview({
	customers,
	limit,
}: {
	customers: CustomerRow[];
	limit: number;
}) {
	const unrun = customers.filter((c) => !c._event);
	const previewed = unrun.slice(0, limit);
	if (limit === 0) return null;
	return (
		<div className="h-48 overflow-y-auto rounded-xl border border-border mt-1.5">
			{previewed.length === 0 ? (
				<div className="px-3 py-4 text-center text-xs text-subtle">
					No customers to preview
				</div>
			) : (
				previewed.map((c) => (
					<div
						key={c.internal_id}
						className="flex items-center gap-2 w-full px-3 py-1.5 text-sm"
					>
						<span className="flex-1 truncate text-foreground">
							{c.name || c.id || c.internal_id}
						</span>
						{c.email && (
							<span className="text-xs text-subtle truncate max-w-32">
								{c.email}
							</span>
						)}
					</div>
				))
			)}
		</div>
	);
}

function SampleCustomerPicker({
	customers,
	selectedIds,
	onChange,
}: {
	customers: CustomerRow[];
	selectedIds: string[];
	onChange: (ids: string[]) => void;
}) {
	const [search, setSearch] = useState("");
	const filtered = useMemo(() => {
		if (!search) return customers;
		const q = search.toLowerCase();
		return customers.filter(
			(c) =>
				c.name?.toLowerCase().includes(q) ||
				c.id?.toLowerCase().includes(q) ||
				c.email?.toLowerCase().includes(q),
		);
	}, [customers, search]);

	const toggle = (id: string) => {
		onChange(
			selectedIds.includes(id)
				? selectedIds.filter((v) => v !== id)
				: [...selectedIds, id],
		);
	};

	return (
		<div className="flex flex-col gap-2">
			<Input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search customers..."
				className="text-sm"
			/>
			<div className="h-48 overflow-y-auto rounded-xl border border-border">
				{filtered.length === 0 ? (
					<div className="px-3 py-4 text-center text-xs text-subtle">
						No customers found
					</div>
				) : (
					filtered.map((c) => {
						const isSelected = selectedIds.includes(c.id ?? c.internal_id);
						return (
							<button
								key={c.internal_id}
								type="button"
								onClick={() => toggle(c.id ?? c.internal_id)}
								className={cn(
									"flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50 cursor-pointer transition-colors",
									isSelected && "bg-primary/5",
								)}
							>
								<div
									className={cn(
										"size-4 rounded border flex items-center justify-center shrink-0",
										isSelected
											? "border-primary bg-primary"
											: "border-border",
									)}
								>
									{isSelected && (
										<CheckIcon size={10} className="text-white" />
									)}
								</div>
								<span className="flex-1 truncate text-foreground">
									{c.name || c.id || c.internal_id}
								</span>
								{c.email && (
									<span className="text-xs text-subtle truncate max-w-32">
										{c.email}
									</span>
								)}
							</button>
						);
					})
				)}
			</div>
			<span className="text-xs text-tertiary-foreground">
				{selectedIds.length} selected
			</span>
		</div>
	);
}
