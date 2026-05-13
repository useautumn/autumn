import type { CustomerWithProducts } from "@autumn/shared";
import {
	CalendarBlankIcon,
	EyeIcon,
	PlayIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { InfoRow } from "@/components/v2/InfoRow";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import type { MigrationItemEvent } from "@/hooks/queries/useMigrationRunsQuery";
import { ActiveRunDot, ItemEventStatusBadge } from "../runs/RunStatusBadge";
import { EventResultDetail } from "./EventResultDetail";

function formatEventTimestamp(timestamp: string): string {
	return format(new Date(timestamp), "MMM d, HH:mm:ss");
}

function StatusValue({
	latestEvent,
	isActive,
}: {
	latestEvent: MigrationItemEvent | undefined;
	isActive: boolean;
}) {
	if (latestEvent)
		return (
			<div className="flex items-center gap-1.5">
				{latestEvent.dry_run && (
					<span className="text-[10px] font-medium text-t3">Dry Run:</span>
				)}
				<ItemEventStatusBadge
					status={latestEvent.status}
					dryRun={latestEvent.dry_run}
					response={latestEvent.response}
				/>
			</div>
		);
	if (isActive)
		return (
			<div className="flex items-center gap-2">
				<ActiveRunDot />
				<span className="text-xs text-t2">Queued</span>
			</div>
		);
	return <Badge variant="muted">Not Run</Badge>;
}

export function CustomerRunSheet({
	customer,
	latestEvent,
	allEvents,
	isActive,
	isRunning,
	onTriggerRun,
}: {
	customer: CustomerWithProducts;
	latestEvent: MigrationItemEvent | undefined;
	allEvents: MigrationItemEvent[];
	isActive: boolean;
	isRunning: boolean;
	onTriggerRun: (opts: { dryRun: boolean; only?: string[] }) => void;
}) {
	const customerId = customer.id ?? customer.internal_id;
	const [isConfirming, setIsConfirming] = useState(false);
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
		if (!isConfirming) {
			setIsConfirming(true);
			setTimeout(() => setIsConfirming(false), 3000);
			return;
		}
		setIsConfirming(false);
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

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title={
					<span className="flex items-center gap-2">
						{customer.name || customerId}
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
							<StatusValue latestEvent={latestEvent} isActive={isActive} />
						}
					/>
					{latestEvent && (
						<InfoRow
							icon={<CalendarBlankIcon size={16} weight="duotone" />}
							label="Last Run"
							value={formatEventTimestamp(latestEvent.timestamp)}
						/>
					)}
				</div>
			</SheetSection>

			{latestEvent && (
				<SheetSection
					title={
						<div className="flex items-center justify-between w-full">
							<span>Preview</span>
							<span className="text-xs text-t3 font-normal">
								{formatEventTimestamp(latestEvent.timestamp)}
							</span>
						</div>
					}
				>
					<EventResultDetail event={latestEvent} />
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
								<span className="text-xs text-t3 shrink-0">
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
					variant={isConfirming ? "destructive" : "primary"}
					className="flex-1"
					onClick={handleLiveRun}
					isLoading={isRunning && lastActionRef.current === "live"}
					disabled={
						hasSuccessfulLiveRun ||
						(isRunning && lastActionRef.current !== "live")
					}
				>
					{isConfirming ? (
						<WarningIcon size={14} weight="fill" />
					) : (
						<PlayIcon size={14} weight="fill" />
					)}
					{isConfirming ? "Confirm" : "Run"}
				</Button>
			</div>
		</div>
	);
}
