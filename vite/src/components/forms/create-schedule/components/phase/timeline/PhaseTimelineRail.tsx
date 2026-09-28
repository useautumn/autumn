import { PlusIcon } from "@phosphor-icons/react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { cn } from "@/lib/utils";

/** The dot sits level with the phase header; the connector runs on to the next phase's dot. */
export type PhaseTimelineStatus = "past" | "current" | "scheduled";

const CONNECTOR_CLASS: Record<PhaseTimelineStatus, string> = {
	past: "w-px bg-border",
	current: "w-px bg-primary",
	scheduled: "w-0 border-l border-dashed border-border",
};

export function PhaseTimelineRail({
	phaseIndex,
	status,
	isLast,
	connectsToNext = !isLast,
}: {
	phaseIndex: number;
	status: PhaseTimelineStatus;
	isLast: boolean;
	connectsToNext?: boolean;
}) {
	const { isPhaseLocked, handleInsertPhase } = useCustomerStateContext();
	const canInsertAfter = !isLast && !isPhaseLocked({ phaseIndex });

	return (
		<>
			{connectsToNext && (
				<span
					aria-hidden
					className={cn(
						"absolute top-4 -bottom-4 left-1/2 -translate-x-1/2",
						CONNECTOR_CLASS[status],
					)}
				/>
			)}
			<span
				aria-hidden
				className={cn(
					"absolute top-4 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
					status === "current"
						? "bg-primary"
						: "border border-tertiary-foreground bg-card",
				)}
			/>
			{canInsertAfter && (
				<button
					type="button"
					aria-label="Insert phase after"
					onClick={() => handleInsertPhase({ afterIndex: phaseIndex })}
					className="absolute bottom-0.5 left-1/2 z-10 flex size-4 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-subtle opacity-0 transition-opacity hover:border-foreground hover:text-foreground focus-visible:opacity-100 group-hover/phase-row:opacity-100"
				>
					<PlusIcon size={9} weight="bold" />
				</button>
			)}
		</>
	);
}
