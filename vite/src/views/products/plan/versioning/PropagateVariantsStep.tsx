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
import {
	conflictBadgeLabel,
	conflictSentence,
	type VariantConflictInfo,
} from "./variantConflicts";

interface PropagateVariantsStepProps {
	variants: VariantConflictInfo[];
	selectedIds: string[];
	onToggle: (id: string) => void;
}

export function PropagateVariantsStep({
	variants,
	selectedIds,
	onToggle,
}: PropagateVariantsStepProps) {
	if (variants.length === 0) return null;

	const hasConflicts = variants.some((v) => v.conflicts.length > 0);

	return (
		<div className="flex flex-col gap-2">
			{hasConflicts && (
				<InfoBox variant="warning">
					This update conflicts with certain variants. We recommend handling
					those separately.
				</InfoBox>
			)}

			<div className="flex flex-col gap-2">
				{variants.map(({ variant, conflicts, itemChanges }) => {
					const checked = selectedIds.includes(variant.id);
					const hasConflict = conflicts.length > 0;
					return (
						<button
							className={cn(
								"flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2.5 text-left ring-1 transition-colors",
								checked
									? "ring-primary"
									: "ring-transparent hover:bg-secondary/60",
							)}
							key={variant.id}
							onClick={() => onToggle(variant.id)}
							type="button"
						>
							<Checkbox checked={checked} />
							<div className="flex min-w-0 flex-1 items-baseline gap-2">
								<span className="text-sm font-medium text-foreground">
									{variant.name}
								</span>
								<span className="truncate font-mono text-tertiary-foreground text-xs">
									{variant.id}
								</span>
							</div>
							<HoverCard>
								<HoverCardTrigger asChild closeDelay={0} delay={0}>
									<span
										className="flex shrink-0 cursor-help items-center gap-1 text-xs"
										onClick={(e) => e.stopPropagation()}
									>
										{hasConflict ? (
											<span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
												<WarningIcon size={11} weight="fill" />
												{conflictBadgeLabel(conflicts)}
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
										{itemChanges.length > 0 ? (
											<>
												<span className="text-xs text-muted-foreground">
													Propagating would make these changes:
												</span>
												<ItemChangeList itemChanges={itemChanges} />
											</>
										) : (
											<span className="text-xs text-muted-foreground">
												No changes from this update.
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
