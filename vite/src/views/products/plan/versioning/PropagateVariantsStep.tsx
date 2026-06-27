import { Badge, Checkbox } from "@autumn/ui";
import { WarningIcon } from "@phosphor-icons/react";
import type { VariantConflictInfo } from "./variantConflicts";
import { cn } from "@/lib/utils";

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

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<span className="text-sm font-medium text-foreground">
					Apply to variants
				</span>
				<span className="text-xs text-muted-foreground">
					Select which variants receive this change. Unselected variants stay as
					they are — handle conflicts separately.
				</span>
			</div>

			<div className="flex flex-col gap-2">
				{variants.map(({ variant, conflictFeatureNames }) => {
					const checked = selectedIds.includes(variant.id);
					const hasConflict = conflictFeatureNames.length > 0;
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
								<Badge
									variant="secondary"
									className="shrink-0 gap-1 text-[11px] text-amber-600 dark:text-amber-500 bg-amber-500/10"
									title={`Diverges on: ${conflictFeatureNames.join(", ")}`}
								>
									<WarningIcon size={11} weight="fill" />
									Conflict
								</Badge>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
