import type { CatalogConflictPreview, Feature } from "@autumn/shared";
import {
	Checkbox,
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@autumn/ui";
import { EyeIcon, WarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	type CatalogPlanChangeDiff,
	catalogTargetDiffHasChanges,
} from "../catalog/catalogPlanPreview";
import { TargetDiffPreview } from "./TargetDiffPreview";
import { conflictBadgeLabel, conflictSentence } from "./variantConflicts";

/**
 * One selectable propagation target. The label region is the toggle button so
 * that `trailing` controls stay siblings rather than nested interactives.
 */
export function PropagationTargetRow({
	name,
	detail,
	checked,
	indeterminate,
	conflicts,
	diff,
	features,
	onToggle,
	trailing,
}: {
	name: string;
	detail: string;
	checked: boolean;
	indeterminate?: boolean;
	conflicts: CatalogConflictPreview[];
	diff: CatalogPlanChangeDiff;
	features?: Feature[];
	onToggle: () => void;
	trailing?: ReactNode;
}) {
	const hasConflict = conflicts.length > 0;

	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2.5 ring-1 transition-colors",
				checked || indeterminate ? "ring-primary" : "ring-transparent",
			)}
		>
			<button
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
				onClick={onToggle}
				type="button"
			>
				<Checkbox
					checked={checked}
					className="pointer-events-none"
					indeterminate={indeterminate}
				/>
				<div className="flex min-w-0 flex-1 items-baseline gap-2">
					<span className="truncate font-medium text-foreground text-sm">
						{name}
					</span>
					<span className="truncate font-mono text-tertiary-foreground text-xs">
						{detail}
					</span>
				</div>
			</button>

			{trailing}

			<HoverCard>
				<HoverCardTrigger asChild closeDelay={0} delay={0}>
					<span className="flex shrink-0 cursor-pointer items-center gap-1 text-xs">
						{hasConflict ? (
							<span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
								<WarningIcon size={11} weight="fill" />
								{conflictBadgeLabel(conflicts)}
							</span>
						) : (
							<span
								className="flex items-center text-muted-foreground"
								title="Preview changes"
							>
								<EyeIcon size={13} />
							</span>
						)}
					</span>
				</HoverCardTrigger>
				<HoverCardContent
					align="start"
					className="w-80 rounded-lg border-none bg-interactive-secondary p-3 shadow-md ring-1 ring-foreground/10"
					side="right"
				>
					<div className="flex flex-col gap-2">
						{hasConflict && (
							<div className="flex flex-col gap-1">
								{conflicts.map((conflict, index) => (
									<span
										className="text-amber-600 text-xs dark:text-amber-500"
										key={`${conflict.reason}-${index}`}
									>
										{conflictSentence(conflict)}
									</span>
								))}
							</div>
						)}
						{catalogTargetDiffHasChanges({
							...diff,
							settingChanges: [],
						}) && (
							<span className="text-muted-foreground text-xs">
								Propagating would make these changes:
							</span>
						)}
						<TargetDiffPreview
							diff={diff}
							emptyLabel="No effective changes from this update."
							features={features}
						/>
					</div>
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}
