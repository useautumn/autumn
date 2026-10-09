import { StatusChipIcon } from "@autumn/ui";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

/** Upcoming waits on earlier steps; done can be edited; locked is done for good. */
export type AtomSectionState =
	| "upcoming"
	| "active"
	| "done"
	| "locked"
	| "failed";

export type AtomStep = {
	key: string;
	title: string;
	state: AtomSectionState;
	onEdit?: () => void;
};

const isPast = (state: AtomSectionState) =>
	state === "done" || state === "locked";

/** A step's number until it is reached; done and failed steps show their status instead. */
export const AtomStepMarker = ({
	index,
	state,
}: {
	index: number;
	state: AtomSectionState;
}) => {
	if (isPast(state)) return <StatusChipIcon tone="green" glyph="check" />;
	if (state === "failed") return <StatusChipIcon tone="red" glyph="x" />;
	return (
		<span
			className={cn(
				"flex size-4 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums text-tertiary-foreground",
				state === "active" && "border-primary bg-primary text-white",
			)}
		>
			{index + 1}
		</span>
	);
};

/** The setup's steps in one row; a done step can be clicked to edit it. */
export const AtomStepper = ({ steps }: { steps: AtomStep[] }) => (
	<ol className="flex h-10 items-center gap-3 px-3">
		{steps.map((step, index) => {
			const canEdit = step.state === "done" && step.onEdit;
			return (
				<Fragment key={step.key}>
					{index > 0 && (
						<li
							aria-hidden
							className={cn(
								"h-px min-w-6 flex-1 bg-table-tray-border",
								isPast(steps[index - 1].state) && "bg-green-500/40",
							)}
						/>
					)}
					<li
						aria-current={step.state === "active" ? "step" : undefined}
						className="flex shrink-0"
					>
						<button
							type="button"
							disabled={!canEdit}
							onClick={step.onEdit}
							className={cn(
								"flex items-center gap-2 text-sm font-medium text-foreground",
								canEdit && "cursor-pointer hover:text-muted-foreground",
								step.state === "upcoming" &&
									"font-normal text-tertiary-foreground",
							)}
						>
							<AtomStepMarker index={index} state={step.state} />
							{step.title}
						</button>
					</li>
				</Fragment>
			);
		})}
	</ol>
);
