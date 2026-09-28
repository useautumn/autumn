import { ButtonGroup, IconButton } from "@autumn/ui";
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
		<ButtonGroup className="shrink-0">
			<IconButton
				aria-label={isCustom ? "Edit custom plan" : "Customize plan"}
				className={cn(
					"size-6 shrink-0",
					isCustom
						? "bg-primary/15 text-primary hover:bg-primary/25"
						: "text-tertiary-foreground hover:text-foreground",
				)}
				icon={<PencilSimpleIcon />}
				onClick={onCustomize}
				size="sm"
				type="button"
				variant="secondary"
			/>
			{actions.length > 0 && (
				<PlanRowActionsMenu actions={actions} variant="secondary" />
			)}
		</ButtonGroup>
	);
}
