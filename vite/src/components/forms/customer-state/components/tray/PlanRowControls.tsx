import { IconButton } from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import {
	type PlanRowAction,
	PlanRowActionsMenu,
} from "@/components/forms/shared/PlanRowActionsMenu";
import { cn } from "@/lib/utils";

/** Customize and the row menu joined as one split button. */
export function PlanRowControls({
	isCustom = false,
	onCustomize,
	actions,
}: {
	isCustom?: boolean;
	onCustomize?: () => void;
	actions: PlanRowAction[];
}) {
	if (!onCustomize) return <PlanRowActionsMenu actions={actions} />;

	return (
		<div className="flex shrink-0 items-center rounded-md border border-border transition-colors hover:bg-muted/40">
			<IconButton
				aria-label={isCustom ? "Edit custom plan" : "Customize plan"}
				className={cn(
					"size-6 shrink-0 hover:text-foreground",
					isCustom ? "text-emerald-500" : "text-tertiary-foreground",
				)}
				icon={<PencilSimpleIcon />}
				onClick={onCustomize}
				size="sm"
				type="button"
				variant="muted"
			/>
			{actions.length > 0 && (
				<>
					<span className="h-3.5 w-px bg-border" />
					<PlanRowActionsMenu actions={actions} />
				</>
			)}
		</div>
	);
}
