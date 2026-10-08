import { Button, StatusChipIcon } from "@autumn/ui";
import { LockSimpleIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";

/** Upcoming waits on earlier steps; done can be edited; locked is done for good. */
export type AtomSectionState =
	| "upcoming"
	| "active"
	| "done"
	| "locked"
	| "failed";

const StepMarker = ({
	step,
	state,
}: {
	step: number;
	state: AtomSectionState;
}) => {
	if (state === "done" || state === "locked")
		return <StatusChipIcon tone="green" glyph="check" />;
	if (state === "failed") return <StatusChipIcon tone="red" glyph="x" />;
	return (
		<span
			className={cn(
				"flex size-4 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums text-tertiary-foreground",
				state === "active" && "border-primary bg-primary text-white",
			)}
		>
			{step}
		</span>
	);
};

/** One step of the setup: a header that collapses to a summary once done, and its body while open. */
export const AtomSetupSection = ({
	step,
	title,
	state,
	summary,
	actions,
	onEdit,
	footer,
	children,
}: {
	step: number;
	title: string;
	state: AtomSectionState;
	/** Shown beside the title once the step is past. */
	summary?: string;
	/** Shown at the header's end while the step is open. */
	actions?: React.ReactNode;
	onEdit?: () => void;
	footer?: React.ReactNode;
	children?: React.ReactNode;
}) => {
	const isOpen = state === "active" || state === "failed";
	const isEditable = state === "done" && onEdit;
	const hasSummary = state !== "active" && state !== "upcoming";

	return (
		<section
			aria-label={title}
			className={cn(TABLE_TRAY_CLASS, state === "upcoming" && "opacity-60")}
		>
			<header className="flex h-10 items-center gap-2.5 pr-1 pl-3">
				<StepMarker step={step} state={state} />
				<span className="text-sm font-medium text-foreground">{title}</span>
				{hasSummary && summary && (
					<span className="min-w-0 truncate text-sm text-tertiary-foreground">
						{summary}
					</span>
				)}
				<div className="ml-auto flex shrink-0 items-center gap-2">
					{isOpen && actions}
					{isEditable && (
						<Button variant="skeleton" size="mini" onClick={onEdit}>
							<PencilSimpleIcon className="size-3.5" />
							Edit
						</Button>
					)}
					{state === "locked" && (
						<span className="flex items-center gap-1 pr-2 text-xs text-subtle">
							<LockSimpleIcon className="size-3" />
							Locked
						</span>
					)}
				</div>
			</header>
			{isOpen && children && (
				<div className={TABLE_TRAY_SURFACE_CLASS}>{children}</div>
			)}
			{isOpen && footer && (
				<div className="flex h-11 items-center justify-end gap-2 pr-1 pl-3">
					{footer}
				</div>
			)}
		</section>
	);
};
