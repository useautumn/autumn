import type { PlanUpdatePreviewItemChange } from "@autumn/shared";
import { cn } from "@/lib/utils";

export function VariantItemChangeRow({
	change,
}: {
	change: PlanUpdatePreviewItemChange;
}) {
	const isDeleted = change.action === "deleted";
	const primaryText = change.item.display?.primary_text ?? change.feature_id;
	const secondaryText = change.item.display?.secondary_text;

	return (
		<div
			className={cn(
				"rounded-xl bg-muted/60 px-3 py-2",
				isDeleted && "opacity-50",
			)}
		>
			<div className="flex items-start gap-2">
				<span
					className={cn(
						"mt-1.5 size-1.5 shrink-0 rounded-full",
						isDeleted ? "bg-muted-foreground" : "bg-primary",
					)}
				/>
				<div className="min-w-0">
					<div className="truncate text-sm text-foreground">{primaryText}</div>
					{secondaryText && (
						<div className="truncate text-xs text-tertiary-foreground">
							{secondaryText}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
