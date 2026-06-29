import {
	Badge,
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
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<span className="text-sm font-medium text-foreground">
					Apply to variants
				</span>
				<span className="text-xs text-muted-foreground">
					Select which variants receive this change. Unselected variants stay as
					they are.
				</span>
			</div>

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
								"flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
								checked
									? "border-primary bg-primary/5"
									: "border-border hover:bg-muted/50",
							)}
							key={variant.id}
							onClick={() => onToggle(variant.id)}
							type="button"
						>
							<Checkbox checked={checked} />
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium text-foreground">
									{variant.name}
								</span>
								<span className="truncate text-xs text-muted-foreground">
									{variant.id}
								</span>
							</div>
							<HoverCard>
								<HoverCardTrigger asChild closeDelay={0} delay={0}>
									<span
										className="cursor-help"
										onClick={(e) => e.stopPropagation()}
									>
										{hasConflict ? (
											<Badge
												className="shrink-0 gap-1 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-500"
												variant="secondary"
											>
												<WarningIcon size={11} weight="fill" />
												{conflictBadgeLabel(conflicts)}
											</Badge>
										) : (
											<Badge
												className="shrink-0 gap-1 text-[11px] text-muted-foreground"
												variant="secondary"
											>
												<EyeIcon size={11} />
												Preview update
											</Badge>
										)}
									</span>
								</HoverCardTrigger>
								<HoverCardContent
									align="start"
									className="w-80 p-3"
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
