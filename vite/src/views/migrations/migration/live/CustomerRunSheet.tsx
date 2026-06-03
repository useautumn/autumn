import type { Operations } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	CalendarBlankIcon,
	EyeIcon,
	LightningIcon,
	PlayIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { InfoRow } from "@/components/v2/InfoRow";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import type { MigrationPreviewCustomer } from "@/hooks/queries/useMigrationFilterPreview";
import type { MigrationItemEvent } from "@/hooks/queries/useMigrationRunsQuery";
import { navigateTo } from "@/utils/genUtils";
import { ActiveRunDot, ItemEventStatusBadge } from "../runs/RunStatusBadge";
import { RunSummaryRows } from "../shared/RunSummaryRows";
import { EventResultDetail } from "./EventResultDetail";

function formatEventTimestamp(timestamp: string): string {
	return format(new Date(timestamp), "MMM d, HH:mm:ss");
}

function StatusValue({
	itemRun,
	latestDryEvent,
	latestLiveEvent,
	isActive,
	activeRunDryRun,
}: {
	itemRun: MigrationPreviewCustomer["migration_item_run"];
	latestDryEvent: MigrationItemEvent | undefined;
	latestLiveEvent: MigrationItemEvent | undefined;
	isActive: boolean;
	activeRunDryRun: boolean | null;
}) {
	if (isActive)
		return (
			<div className="flex items-center gap-2">
				<ActiveRunDot />
				<span className="text-xs text-muted-foreground">
					{activeRunDryRun ? "Dry run in progress" : "Running"}
				</span>
			</div>
		);
	if (itemRun?.status === "running") {
		return (
			<div className="flex items-center gap-2">
				<ActiveRunDot />
				<span className="text-xs text-muted-foreground">Running</span>
			</div>
		);
	}
	if (itemRun?.status) {
		const event =
			latestLiveEvent?.status === itemRun.status ? latestLiveEvent : undefined;
		return (
			<ItemEventStatusBadge
				status={itemRun.status}
				dryRun={false}
				response={event?.response ?? null}
				timestamp={event?.timestamp}
			/>
		);
	}
	const event = latestLiveEvent ?? latestDryEvent;
	if (event)
		return (
			<div className="flex items-center gap-1.5">
				{event.dry_run && (
					<span className="text-[10px] font-medium text-tertiary-foreground">
						Dry Run:
					</span>
				)}
				<ItemEventStatusBadge
					status={event.status}
					dryRun={event.dry_run}
					response={event.response}
				/>
			</div>
		);
	return <Badge variant="muted">Not Run</Badge>;
}

export function CustomerRunSheet({
	customer,
	latestDryEvent,
	latestLiveEvent,
	allEvents,
	isActive,
	activeRunDryRun,
	isRunning,
	onTriggerRun,
	operations,
	noBillingChanges,
}: {
	customer: MigrationPreviewCustomer;
	latestDryEvent: MigrationItemEvent | undefined;
	latestLiveEvent: MigrationItemEvent | undefined;
	allEvents: MigrationItemEvent[];
	isActive: boolean;
	activeRunDryRun: boolean | null;
	isRunning: boolean;
	onTriggerRun: (opts: { dryRun: boolean; only?: string[] }) => void;
	operations: Operations;
	noBillingChanges: boolean;
}) {
	const navigate = useNavigate();
	const customerId = customer.id ?? customer.internal_id;
	const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
	const lastActionRef = useRef<"dry" | "live" | null>(null);

	const prevRunningRef = useRef(isRunning);
	useEffect(() => {
		if (prevRunningRef.current && !isRunning) lastActionRef.current = null;
		prevRunningRef.current = isRunning;
	}, [isRunning]);

	const hasSuccessfulLiveRun = allEvents.some(
		(e) => e.status === "succeeded" && !e.dry_run,
	);

	const handleDryRun = () => {
		lastActionRef.current = "dry";
		onTriggerRun({ dryRun: true, only: [customerId] });
	};

	const handleLiveRun = () => {
		setIsRunDialogOpen(false);
		lastActionRef.current = "live";
		onTriggerRun({ dryRun: false, only: [customerId] });
	};

	const sortedEvents = useMemo(
		() =>
			[...allEvents].sort(
				(a, b) =>
					new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
			),
		[allEvents],
	);

	const lastRunTimestamp =
		latestLiveEvent?.timestamp ?? latestDryEvent?.timestamp;

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title={
					<span className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => navigateTo(`/customers/${customerId}`, navigate)}
							className="inline-flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer"
						>
							{customer.name || customerId}
							<ArrowSquareOutIcon size={14} weight="bold" className="opacity-50" />
						</button>
						{isActive && <ActiveRunDot />}
					</span>
				}
				description={customer.email || "No email"}
			/>

			<SheetSection>
				<div className="space-y-3">
					<InfoRow
						icon={<EyeIcon size={16} weight="duotone" />}
						label="Status"
						value={
							<StatusValue
								itemRun={customer.migration_item_run}
								latestDryEvent={latestDryEvent}
								latestLiveEvent={latestLiveEvent}
								isActive={isActive}
								activeRunDryRun={activeRunDryRun}
							/>
						}
					/>
					{lastRunTimestamp && (
						<InfoRow
							icon={<CalendarBlankIcon size={16} weight="duotone" />}
							label="Last Run"
							value={formatEventTimestamp(lastRunTimestamp)}
						/>
					)}
				</div>
			</SheetSection>

			{latestLiveEvent && (
				<SheetSection
					title={
						<div className="flex items-center justify-between w-full">
							<span className="flex items-center gap-1.5">
								<LightningIcon
									size={14}
									weight="fill"
									className="text-tertiary-foreground"
								/>
								Live Run
							</span>
							<span className="text-xs text-tertiary-foreground font-normal">
								{formatEventTimestamp(latestLiveEvent.timestamp)}
							</span>
						</div>
					}
				>
					<EventResultDetail event={latestLiveEvent} />
				</SheetSection>
			)}

			{latestDryEvent && (
				<SheetSection
					title={
						<div className="flex items-center justify-between w-full">
							<span className="flex items-center gap-1.5">
								<EyeIcon
									size={14}
									weight="duotone"
									className="text-tertiary-foreground"
								/>
								Preview
							</span>
							<span className="text-xs text-tertiary-foreground font-normal">
								{formatEventTimestamp(latestDryEvent.timestamp)}
							</span>
						</div>
					}
				>
					<EventResultDetail event={latestDryEvent} />
				</SheetSection>
			)}

			{sortedEvents.length > 0 && (
				<SheetSection title="Run History">
					<div className="flex flex-col">
						{sortedEvents.map((event, index) => (
							<div
								key={`${event.migration_run_id}-${event.item_id}-${index}`}
								className="flex items-center justify-between gap-2 py-1.5"
							>
								<ItemEventStatusBadge
									status={event.status}
									dryRun={event.dry_run}
									response={event.response}
								/>
								<span className="text-xs text-tertiary-foreground shrink-0">
									{formatEventTimestamp(event.timestamp)}
								</span>
							</div>
						))}
					</div>
				</SheetSection>
			)}

			<div className="sticky bottom-0 p-4 flex gap-2 bg-card mt-auto">
				<Button
					variant="secondary"
					className="flex-1"
					onClick={handleDryRun}
					isLoading={isRunning && lastActionRef.current === "dry"}
					disabled={
						hasSuccessfulLiveRun ||
						(isRunning && lastActionRef.current !== "dry")
					}
				>
					<EyeIcon size={14} />
					Dry Run
				</Button>
				<Button
					variant="primary"
					className="flex-1"
					onClick={() => setIsRunDialogOpen(true)}
					disabled={hasSuccessfulLiveRun || isRunning}
				>
					<PlayIcon size={14} weight="fill" />
					Run
				</Button>
			</div>

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
							<UserIcon size={14} weight="duotone" className="text-blue-500" />
						}
						customerLabel={customer.name || customer.id || "1 customer"}
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
							onClick={handleLiveRun}
							isLoading={isRunning && lastActionRef.current === "live"}
						>
							<PlayIcon size={14} weight="fill" />
							Run
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
