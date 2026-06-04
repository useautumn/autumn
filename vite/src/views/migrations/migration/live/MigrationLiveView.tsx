import type { MigrationFilter, Operations } from "@autumn/shared";
import {
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
import { parseAsBoolean, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Table } from "@/components/general/table";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { Separator } from "@/components/v2/separator";
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
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	type MigrationPreviewCustomer,
	useMigrationFilterPreview,
} from "@/hooks/queries/useMigrationFilterPreview";
import {
	type MigrationItemEvent,
	useMigrationRunsQuery,
} from "@/hooks/queries/useMigrationRunsQuery";
import {
	type RetryableMigrationItemRunStatus,
	useMigrationsQuery,
} from "@/hooks/queries/useMigrationsQuery";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";
import { createCustomerListColumns } from "@/views/customers2/components/table/customer-list/CustomerListColumns";
import { CustomerListFilterButton } from "@/views/customers2/components/table/customer-list/CustomerListFilterButton";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { useRealtimeSubscriptions } from "../hooks/useRealtimeSubscriptions";
import { ItemEventStatusBadge } from "../runs/RunStatusBadge";
import { type StepId, StepIndicator } from "../StepIndicator";
import { OperationsPreview } from "../shared/OperationsPreview";
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
type AdminRunControls = {
	lazyRun: boolean;
	retryErrored: boolean;
	retrySkipped: boolean;
};

type CustomerRow = MigrationPreviewCustomer & {
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

function buildRetryItemStatuses({
	retryErrored,
	retrySkipped,
}: Pick<AdminRunControls, "retryErrored" | "retrySkipped">) {
	const statuses: RetryableMigrationItemRunStatus[] = [];
	if (retryErrored) statuses.push("failed");
	if (retrySkipped) statuses.push("skipped");
	return statuses.length > 0 ? statuses : undefined;
}

const statusColumn: ColumnDef<CustomerRow, unknown> = {
	id: "migration_status",
	header: "Status",
	size: 140,
	cell: ({ row }: { row: Row<CustomerRow> }) => {
		const event = row.original._event;
		const itemRun = row.original.migration_item_run;
		const activeStatus = row.original._activeStatus;

		if (itemRun?.status === "running") {
			return (
				<Badge variant="muted" className="gap-1.5">
					<ActiveDot color="green" />
					Running
				</Badge>
			);
		}

		if (itemRun?.status && itemRun.status !== "running") {
			return (
				<ItemEventStatusBadge
					status={itemRun.status}
					dryRun={false}
					response={event?.status === itemRun.status ? event.response : null}
					timestamp={
						event?.status === itemRun.status ? event.timestamp : undefined
					}
				/>
			);
		}

		if (activeStatus) {
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
					timestamp={event.timestamp}
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
}: {
	migrationId: string;
	filter: MigrationFilter;
	operations: Operations;
	noBillingChanges: boolean;
	step: StepId;
	onStepChange: (step: StepId) => void;
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
	const [isRunDialogOpen, setIsRunDialogOpen] = useQueryState(
		"run",
		parseAsBoolean.withDefault(false),
	);
	const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
	const [runControls, setRunControls] = useState({
		lazyRun: true,
		retryErrored: false,
		retrySkipped: false,
	});
	const [sample, setSample] = useState({
		open: false,
		mode: "limit" as "limit" | "select",
		limit: "10",
		customerIds: [] as string[],
		running: null as "dry" | "live" | null,
	});
	const { cancelRun, isCanceling } = useMigrationsQuery();

	const resolvedRunControls = {
		lazyRun: runControls.lazyRun,
		retryItemStatuses: buildRetryItemStatuses(runControls),
	};

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

	const handleExecutionStatusesChange = useCallback(
		(statuses: ExecutionStatus[]) => {
			setExecutionStatuses(statuses);
			setPagination((p) => ({ ...p, pageIndex: 0 }));
		},
		[],
	);

	const {
		itemEvents,
		runs,
		invalidate: invalidateRuns,
	} = useMigrationRunsQuery({ migrationId });

	const latestRun = runs[0];

	const {
		customers,
		count,
		isLoading: isLoadingCustomers,
	} = useMigrationFilterPreview({
		filter: filter.customer ?? {},
		search: debouncedSearch,
		page: pagination.pageIndex,
		pageSize: pagination.pageSize,
		migrationId,
		executionStatuses,
	});

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
		() => buildEventsByCustomer(itemEvents.filter((event) => !event.dry_run)),
		[itemEvents],
	);

	const activeRun = runs.find(
		(r) => r.status === "queued" || r.status === "running",
	);
	const progressRun = activeRun ?? latestRun;
	const progressCounts = progressRun?.item_run_counts;
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
		const hasStatus = customerFilters.status.length > 0;
		const hasVersion = customerFilters.version.length > 0;
		const hasProcessor = customerFilters.processor.length > 0;
		const hasNone = customerFilters.none;
		if (!hasStatus && !hasVersion && !hasProcessor && !hasNone)
			return enrichedCustomers;
		return enrichedCustomers.filter((c) => {
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
	}, [enrichedCustomers, customerFilters]);

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

				<Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
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

				<Dialog
					open={isRunDialogOpen}
					onOpenChange={(open) => setIsRunDialogOpen(open)}
				>
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
						<OperationsPreview operations={operations} />
						<MigrationRunControls
							value={runControls}
							onChange={setRunControls}
							hasFailedItems={(progressCounts?.failed ?? 0) > 0}
							hasSkippedItems={(progressCounts?.skipped ?? 0) > 0}
						/>
						<DialogFooter>
							<ShortcutButton
								variant="primary"
								metaShortcut="enter"
								className="w-full"
								onClick={() => {
									setIsRunDialogOpen(false);
									triggerRun({ dryRun: false, ...resolvedRunControls });
								}}
							>
								<PlayIcon size={14} weight="fill" />
								Run
							</ShortcutButton>
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
									onClick={() => setSample((s) => ({ ...s, mode: "limit" }))}
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
									onClick={() => setSample((s) => ({ ...s, mode: "select" }))}
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
										<div className="text-xs text-tertiary-foreground">
											Number of customers
										</div>
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
												enrichedCustomers.filter((c) => !c.migration_item_run)
													.length,
											)}{" "}
											customers
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-1.5">
										<div className="text-xs text-tertiary-foreground">
											Select customers to run
										</div>
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
						<MigrationRunControls
							value={runControls}
							onChange={setRunControls}
							lazyDisabled={sample.mode === "select"}
							hasFailedItems={(progressCounts?.failed ?? 0) > 0}
							hasSkippedItems={(progressCounts?.skipped ?? 0) > 0}
						/>
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
											.filter((c) => !c.migration_item_run)
											.slice(0, Number(sample.limit))
											.map((c) => c.id ?? c.internal_id);
										await triggerRun({
											dryRun: true,
											only: topIds,
											...resolvedRunControls,
										});
									} else {
										await triggerRun({
											dryRun: true,
											only: sample.customerIds,
											...resolvedRunControls,
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
											...resolvedRunControls,
										});
									} else {
										await triggerRun({
											dryRun: false,
											only: sample.customerIds,
											...resolvedRunControls,
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
							onChange={handleExecutionStatusesChange}
						/>
					}
					hasActiveExtraFilters={hasActiveExecutionFilters(executionStatuses)}
					onClearExtra={() => handleExecutionStatusesChange([])}
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
					{progressCounts && (
						<ExecutionProgressBadge
							completed={progressCounts.completed}
							running={progressCounts.running}
						/>
					)}
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

function ExecutionProgressBadge({
	completed,
	running,
}: {
	completed: number;
	running: number;
}) {
	if (completed === 0 && running === 0) return null;

	return (
		<span className="flex items-center h-7 px-2 text-[11px] text-tertiary-foreground">
			{completed.toLocaleString()} run
			{running > 0 && `, ${running.toLocaleString()} running`}
		</span>
	);
}

function MigrationRunControls({
	value,
	onChange,
	lazyDisabled = false,
	hasFailedItems = false,
	hasSkippedItems = false,
}: {
	value: AdminRunControls;
	onChange: (value: AdminRunControls) => void;
	invalidConcurrency?: boolean;
	lazyDisabled?: boolean;
	hasFailedItems?: boolean;
	hasSkippedItems?: boolean;
}) {
	return (
		<div className="flex flex-col gap-3">
			<Separator />
			<div
				className={cn(
					"flex items-center justify-between gap-4",
					lazyDisabled && "opacity-50",
				)}
			>
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium text-foreground">Lazy run</span>
					<span className="text-xs text-tertiary-foreground">
						Remaining customers migrate when queried.
					</span>
				</div>
				<Switch
					checked={value.lazyRun && !lazyDisabled}
					disabled={lazyDisabled}
					onCheckedChange={(checked) =>
						onChange({ ...value, lazyRun: checked === true })
					}
				/>
			</div>
			{hasFailedItems && (
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-0.5">
						<span className="text-sm font-medium text-foreground">
							Retry failed
						</span>
						<span className="text-xs text-tertiary-foreground">
							Re-run customers that previously errored.
						</span>
					</div>
					<Switch
						checked={value.retryErrored}
						onCheckedChange={(checked) =>
							onChange({ ...value, retryErrored: checked === true })
						}
					/>
				</div>
			)}
			{hasSkippedItems && (
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-0.5">
						<span className="text-sm font-medium text-foreground">
							Retry skipped
						</span>
						<span className="text-xs text-tertiary-foreground">
							Re-run customers that were skipped.
						</span>
					</div>
					<Switch
						checked={value.retrySkipped}
						onCheckedChange={(checked) =>
							onChange({ ...value, retrySkipped: checked === true })
						}
					/>
				</div>
			)}
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
	const unrun = customers.filter((c) => !c.migration_item_run);
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
	const selectedIdSet = new Set(selectedIds);
	const filteredIds = filtered.map((c) => c.id ?? c.internal_id);
	const allFilteredSelected =
		filteredIds.length > 0 && filteredIds.every((id) => selectedIdSet.has(id));

	const toggle = (id: string) => {
		const nextIds = new Set(selectedIds);
		if (nextIds.has(id)) {
			nextIds.delete(id);
		} else {
			nextIds.add(id);
		}
		onChange(Array.from(nextIds));
	};

	const toggleFiltered = () => {
		const filteredIdSet = new Set(filteredIds);
		if (allFilteredSelected) {
			onChange(selectedIds.filter((id) => !filteredIdSet.has(id)));
			return;
		}

		const nextIds = new Set(selectedIds);
		for (const id of filteredIds) nextIds.add(id);
		onChange(Array.from(nextIds));
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search customers..."
					className="text-sm"
				/>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					disabled={filteredIds.length === 0}
					onClick={toggleFiltered}
					className={cn(
						"h-input",
						allFilteredSelected && "bg-primary/10 text-primary",
					)}
				>
					{allFilteredSelected ? "Clear all" : "Select all"}
				</Button>
			</div>
			<div className="h-48 overflow-y-auto rounded-xl border border-border">
				{filtered.length === 0 ? (
					<div className="px-3 py-4 text-center text-xs text-subtle">
						No customers found
					</div>
				) : (
					filtered.map((c) => {
						const isSelected = selectedIdSet.has(c.id ?? c.internal_id);
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
										isSelected ? "border-primary bg-primary" : "border-border",
									)}
								>
									{isSelected && <CheckIcon size={10} className="text-white" />}
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
