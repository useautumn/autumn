import {
	Badge,
	Checkbox,
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@autumn/ui";
import { WarningIcon } from "@phosphor-icons/react";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import { cn } from "@/lib/utils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import type { VariantConflictInfo } from "./variantConflicts";

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

	const hasConflicts = variants.some((v) => v.conflictFeatureNames.length > 0);

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
				{variants.map(({ variant, conflictFeatureNames, itemChanges }) => {
					const checked = selectedIds.includes(variant.id);
					const hasConflict = conflictFeatureNames.length > 0;
					const conflictLabel = `${conflictFeatureNames.join(", ")} ${conflictFeatureNames.length === 1 ? "is" : "are"} on a different interval here.`;
					return (
						<button
							key={variant.id}
							type="button"
							onClick={() => onToggle(variant.id)}
							className={cn(
								"flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
								checked
									? "border-primary bg-primary/5"
									: "border-border hover:bg-muted/50",
							)}
						>
							<Checkbox checked={checked} />
							<div className="flex flex-col gap-0.5 min-w-0 flex-1">
								<span className="text-sm font-medium text-foreground">
									{variant.name}
								</span>
								<span className="text-xs text-muted-foreground truncate">
									{variant.id}
								</span>
							</div>
							{hasConflict && (
								<HoverCard delay={0}>
									<HoverCardTrigger asChild>
										<span
											className="cursor-help"
											onClick={(e) => e.stopPropagation()}
										>
											<Badge
												className="shrink-0 gap-1 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-500"
												variant="secondary"
											>
												<WarningIcon size={11} weight="fill" />
												Different interval
											</Badge>
										</span>
									</HoverCardTrigger>
									<HoverCardContent align="end" className="w-80 p-3">
										<div className="flex flex-col gap-2">
											<span className="text-xs text-muted-foreground">
												{conflictLabel} Propagating would make these changes:
											</span>
											{itemChanges.length > 0 ? (
												<ItemChangeList itemChanges={itemChanges} />
											) : (
												<span className="text-xs text-muted-foreground">
													No item changes.
												</span>
											)}
										</div>
									</HoverCardContent>
								</HoverCard>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
