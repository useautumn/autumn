import { IconButton } from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import {
	type PlanRowAction,
	PlanRowActionsMenu,
} from "@/components/forms/shared/PlanRowActionsMenu";

/** Customize and the row menu joined as one split button. */
export function PlanRowControls({
	onCustomize,
	actions,
}: {
	onCustomize?: () => void;
	actions: PlanRowAction[];
}) {
	if (!onCustomize) return <PlanRowActionsMenu actions={actions} />;

	return (
		<div className="flex shrink-0 items-center rounded-md border border-border transition-colors hover:bg-muted/40">
			<IconButton
				aria-label="Customize plan"
				className="size-6 shrink-0 text-tertiary-foreground hover:text-foreground"
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
