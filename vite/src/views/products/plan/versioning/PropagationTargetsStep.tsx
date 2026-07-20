import type {
	PlanUpdatePreviewItemChange,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";
import {
	Checkbox,
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@autumn/ui";
import { EyeIcon, WarningIcon } from "@phosphor-icons/react";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { cn } from "@/lib/utils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { conflictBadgeLabel, conflictSentence } from "./variantConflicts";

export type PropagationTarget = {
	id: string;
	name: string;
	detail: string;
	conflicts: PlanUpdatePreviewVariantConflict[];
	itemChanges: PlanUpdatePreviewItemChange[];
};

export function PropagationTargetsStep({
	targets,
	selectedIds,
	onToggle,
}: {
	targets: PropagationTarget[];
	selectedIds: string[];
	onToggle: (id: string) => void;
}) {
	if (targets.length === 0) return null;

	const hasConflicts = targets.some((target) => target.conflicts.length > 0);

	return (
		<div className="flex flex-col gap-2">
			{hasConflicts && (
				<InfoBox variant="warning">
					This update conflicts with certain plans. We recommend handling them
					separately.
				</InfoBox>
			)}

			<div className="flex flex-col gap-2">
				{targets.map((target) => {
					const checked = selectedIds.includes(target.id);
					const hasConflict = target.conflicts.length > 0;
					return (
						<button
							className={cn(
								"flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2.5 text-left ring-1 transition-colors",
								checked
									? "ring-primary"
									: "ring-transparent hover:bg-secondary/60",
							)}
							key={target.id}
							onClick={() => onToggle(target.id)}
							type="button"
						>
							<Checkbox checked={checked} />
							<div className="flex min-w-0 flex-1 items-baseline gap-2">
								<span className="text-sm font-medium text-foreground">
									{target.name}
								</span>
								<span className="truncate font-mono text-tertiary-foreground text-xs">
									{target.detail}
								</span>
							</div>
							<HoverCard>
								<HoverCardTrigger asChild closeDelay={0} delay={0}>
									<span
										className="flex shrink-0 cursor-help items-center gap-1 text-xs"
										onClick={(event) => event.stopPropagation()}
									>
										{hasConflict ? (
											<span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
												<WarningIcon size={11} weight="fill" />
												{conflictBadgeLabel(target.conflicts)}
											</span>
										) : (
											<span className="flex items-center gap-1 text-muted-foreground">
												<EyeIcon size={11} />
												Preview
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
												{target.conflicts.map((conflict, index) => (
													<span
														className="text-amber-600 text-xs dark:text-amber-500"
														key={`${conflict.reason}-${index}`}
													>
														{conflictSentence(conflict)}
													</span>
												))}
											</div>
										)}
										{target.itemChanges.length > 0 ? (
											<>
												<span className="text-xs text-muted-foreground">
													Propagating would make these changes:
												</span>
												<ItemChangeList itemChanges={target.itemChanges} />
											</>
										) : (
											<span className="text-xs text-muted-foreground">
												No effective changes from this update.
											</span>
										)}
									</div>
								</HoverCardContent>
							</HoverCard>
						</button>
					);
				})}
			</div>
		</div>
	);
}
