import { AppEnv, type MigrationFilter, type Operations } from "@autumn/shared";
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
import type { ColumnDef, Row } from "@tanstack/react-table";
import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
	useQueryStates,
} from "nuqs";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Table } from "@/components/general/table";
import { Switch } from "@/components/ui/switch";
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
import { Separator } from "@/components/v2/separator";
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
import {
	CUSTOMER_LIST_PAGE_SIZE_OPTIONS,
	DEFAULT_CUSTOMER_LIST_PAGE_SIZE,
} from "@/utils/constants/customerListPagination";
import { useEnv } from "@/utils/envUtils";
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
import { useCursorPagination } from "@/components/general/table/useCursorPagination";
import { ActiveDot } from "./ActiveDot";
import {
	EXECUTION_STATUS_VALUES,
	type ExecutionStatus,
	ExecutionStatusSubMenu,
	hasActiveExecutionFilters,
} from "./ExecutionStatusSubMenu";
import {
	type ActiveRunStatus,
	buildEventsByCustomer,
	resolveMigrationItemStatus,
} from "./migrationItemStatus";
import { RealtimeRunWatcher } from "./RealtimeRunWatcher";
import { useMigrationSheetStore } from "./useMigrationSheetStore";

type AdminRunControls = {
	lazyRun: boolean;
	retryErrored: boolean;
	retrySkipped: boolean;
	concurrency: string;
};

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 5;

function parseConcurrency(value: string): number | undefined {
	const trimmed = value.trim();
	if (trimmed === "") return undefined;
	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed)) return undefined;
	if (parsed < MIN_CONCURRENCY || parsed > MAX_CONCURRENCY) return undefined;
	return parsed;
}

type CustomerRow = MigrationPreviewCustomer & {
	_event?: MigrationItemEvent;
	_activeStatus?: ActiveRunStatus;
	_activeRunId?: string;
};

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
		const status = resolveMigrationItemStatus({
			event: row.original._event,
			itemRun: row.original.migration_item_run,
			activeStatus: row.original._activeStatus ?? null,
		});

		if (status.kind === "running" || status.kind === "queued") {
			const isQueued = status.kind === "queued";
			return (
				<Badge variant="muted" className="gap-1.5">
					<ActiveDot color={isQueued ? "orange" : "green"} />
					{isQueued ? "Queued" : "Running"}
				</Badge>
			);
		}

		if (status.kind === "result")
			return (
				<ItemEventStatusBadge
					status={status.status}
					dryRun={status.dryRun}
					response={status.response}
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
	const env = useEnv();
	const tableContainerHeight =
		env === AppEnv.Sandbox ? "calc(100vh - 260px)" : "calc(100vh - 220px)";
	const [executionQuery, setExecutionQuery] = useQueryStates(
		{
			execution_status: parseAsArrayOf(
				parseAsStringLiteral(EXECUTION_STATUS_VALUES),
			).withDefault([]),
			q: parseAsString.withDefault(""),
			pageSize: parseAsInteger.withDefault(DEFAULT_CUSTOMER_LIST_PAGE_SIZE),
		},
		{ history: "replace" },
	);
	const executionStatuses = executionQuery.execution_status;
	const search = executionQuery.q;
	const deferredSearch = useDeferredValue(search.trim());
	const pageSize = CUSTOMER_LIST_PAGE_SIZE_OPTIONS.includes(
		executionQuery.pageSize,
	)
		? executionQuery.pageSize
		: DEFAULT_CUSTOMER_LIST_PAGE_SIZE;
	const previewCustomerFilters = useMemo(
		() => ({
			status: customerFilters.status,
			version: customerFilters.version,
			none: customerFilters.none,
			processor: customerFilters.processor,
		}),
		[
			customerFilters.status,
			customerFilters.version,
			customerFilters.none,
			customerFilters.processor,
		],
	);
	const {
		currentCursor,
		currentPage,
		pagination,
		canPrev,
		pushCursor,
		popCursor,
	} = useCursorPagination({
		pageSize,
		resetKey: JSON.stringify({
			executionStatuses,
			pageSize,
			search: search.trim(),
			customerFilters: previewCustomerFilters,
		}),
	});
	const [dismissedError, setDismissedError] = useState<string | null>(null);
	const [isRunDialogOpen, setIsRunDialogOpen] = useQueryState(
		"run",
		parseAsBoolean.withDefault(false),
	);
	const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
	const [runControls, setRunControls] = useState<AdminRunControls>({
		lazyRun: true,
		retryErrored: false,
		retrySkipped: false,
		concurrency: String(MAX_CONCURRENCY),
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
		concurrency: parseConcurrency(runControls.concurrency),
	};
	const invalidConcurrency =
		runControls.concurrency.trim() !== "" &&
		parseConcurrency(runControls.concurrency) === undefined;

	const handleSearchChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setExecutionQuery({ q: e.target.value });
		},
		[setExecutionQuery],
	);

	const handleExecutionStatusesChange = useCallback(
		(statuses: ExecutionStatus[]) => {
			setExecutionQuery({ execution_status: statuses });
		},
		[setExecutionQuery],
	);

	const {
		itemEvents,
		runs,
		isActive: hasActiveRun,
		invalidate: invalidateRuns,
	} = useMigrationRunsQuery({ migrationId });

	const latestRun = runs[0];

	const {
		subscriptions: realtimeSubscriptions,
		hasActive: hasRealtimeActive,
		handleComplete: handleRealtimeComplete,
		isSettling,
		triggerRun,
		isRunning,
	} = useRealtimeSubscriptions({ migrationId, invalidateRuns });
	const isRunInProgress = isRunning || hasActiveRun || hasRealtimeActive;

	const {
		customers,
		count,
		nextCursor,
		isLoading: isLoadingCustomers,
	} = useMigrationFilterPreview({
		filter: filter.customer ?? {},
		search: deferredSearch,
		customerFilters: previewCustomerFilters,
		cursor: currentCursor,
		pageSize,
		migrationId,
		executionStatuses,
		isActive: hasActiveRun || hasRealtimeActive,
	});

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
	const progressRun = activeRun ?? (isSettling ? latestRun : undefined);
	const progressCounts = (progressRun ?? latestRun)?.item_run_counts;
	const canShowPendingStatus =
		executionStatuses.length === 0 || executionStatuses.includes("queued");
	const pendingRunStatus: ActiveRunStatus =
		canShowPendingStatus && (hasRealtimeActive || isSettling || activeRun)
			? "queued"
			: null;
	const activeRunId = progressRun?.internal_id ?? null;
	const activeRunOnlyIds = useMemo(
		() =>
			progressRun?.only_ids && progressRun.only_ids.length > 0
				? new Set(progressRun.only_ids)
				: null,
		[progressRun?.only_ids],
	);
	const isActiveRunScoped =
		!!activeRunOnlyIds || !!(progressRun?.target_limit as number | null);

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
				const isClaimedInActiveRun =
					!!activeRunId &&
					c.migration_item_run?.migration_run_id === activeRunId;
				const hasResultForRun =
					!!hasEventInActiveRun ||
					(isClaimedInActiveRun &&
						c.migration_item_run?.status !== "running");
				const hasPersistedResult =
					!!event ||
					(!!c.migration_item_run &&
						c.migration_item_run.status !== "running");
				const showPending =
					!!pendingRunStatus &&
					isTargeted &&
					!hasResultForRun &&
					!hasPersistedResult;
				let activeStatus: ActiveRunStatus = null;
				if (showPending) {
					activeStatus = isClaimedInActiveRun ? "running" : pendingRunStatus;
				}
				return {
					...c,
					_event: event,
					_activeStatus: activeStatus,
					_activeRunId: activeRunId ?? undefined,
				};
			}),
		[
			customers,
			eventsByCustomer,
			pendingRunStatus,
			activeRunId,
			activeRunOnlyIds,
			isActiveRunScoped,
		],
	);

	const pageCount =
		count !== null ? Math.max(Math.ceil(count / pagination.pageSize), 1) : 1;

	const table = useProductTable<CustomerRow>({
		data: enrichedCustomers,
		columns,
		options: {
			manualPagination: true,
			pageCount,
			state: { pagination },
		},
	});
	const canGoNext = Boolean(nextCursor);
	const isDisabled = isLoadingCustomers;

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
						disabled={isRunInProgress}
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
								disabled={isRunInProgress}
							>
								<CaretDownIcon size={12} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={4}>
							<DropdownMenuItem
								disabled={isRunInProgress}
								onClick={() => triggerRun({ dryRun: true })}
							>
								<EyeIcon size={14} />
								Dry Run All
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={isRunInProgress}
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
									? `${count.toLocaleString()} ${count === 1 ? "customer" : "customers"}`
									: "All matched customers"
							}
							operations={operations}
							noBillingChanges={noBillingChanges}
						/>
						<OperationsPreview operations={operations} />
						<MigrationRunControls
							value={runControls}
							onChange={setRunControls}
							invalidConcurrency={invalidConcurrency}
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
								isLoading={isRunning}
								disabled={isRunInProgress || invalidConcurrency}
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
								invalidConcurrency={invalidConcurrency}
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
									isRunInProgress ||
									invalidConcurrency ||
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
									isRunInProgress ||
									invalidConcurrency ||
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
						placeholder={`Search ${(count ?? 0).toLocaleString()} customers`}
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
							setExecutionQuery({ pageSize: Number(v) });
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
					flexibleTableColumns: true,
					virtualization: {
						containerHeight: tableContainerHeight,
					},
				}}
			>
				<Table.Container>
					<Table.VirtualizedContent>
						<Table.VirtualizedBody />
					</Table.VirtualizedContent>
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
	invalidConcurrency = false,
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
			<div className="flex items-center justify-between gap-4">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium text-foreground">
						Concurrency
					</span>
					<span className="text-xs text-tertiary-foreground">
						Customers processed in parallel. Max {MAX_CONCURRENCY}.
					</span>
				</div>
				<Input
					type="number"
					min={MIN_CONCURRENCY}
					max={MAX_CONCURRENCY}
					value={value.concurrency}
					onChange={(e) => onChange({ ...value, concurrency: e.target.value })}
					placeholder="Auto"
					className={cn(
						"w-20 text-sm",
						invalidConcurrency && "border-red-500 focus-visible:ring-red-500",
					)}
				/>
			</div>
			{invalidConcurrency && (
				<span className="text-xs text-red-500">
					Concurrency must be less than {MAX_CONCURRENCY}.
				</span>
			)}
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
