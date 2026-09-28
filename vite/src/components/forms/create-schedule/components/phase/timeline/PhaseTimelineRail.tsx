import { PlusIcon } from "@phosphor-icons/react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { cn } from "@/lib/utils";

/** The dot sits level with the phase header; the connector runs on to the next phase's dot. */
export function PhaseTimelineRail({
	phaseIndex,
	isCurrent,
	isLast,
}: {
	phaseIndex: number;
	isCurrent: boolean;
	isLast: boolean;
}) {
	const { isPhaseLocked, handleInsertPhase } = useCustomerStateContext();
	const canInsertAfter = !isLast && !isPhaseLocked({ phaseIndex });

	return (
		<>
			{!isLast && (
				<span
					aria-hidden
					className="absolute top-4 -bottom-4 left-1/2 w-px -translate-x-1/2 bg-border"
				/>
			)}
			<span
				aria-hidden
				className={cn(
					"absolute top-4 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
					isCurrent
						? "bg-primary"
						: "border border-tertiary-foreground bg-card",
				)}
			/>
			{canInsertAfter && (
				<button
					type="button"
					aria-label="Insert phase after"
					onClick={() => handleInsertPhase({ afterIndex: phaseIndex })}
					className="absolute bottom-0.5 left-1/2 z-10 flex size-4 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-subtle opacity-0 transition-opacity hover:border-primary hover:text-foreground focus-visible:opacity-100 group-hover/phase-row:opacity-100"
				>
					<PlusIcon size={9} weight="bold" />
				</button>
			)}
		</>
	);
}
