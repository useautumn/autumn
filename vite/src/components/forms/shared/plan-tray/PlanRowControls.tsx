import { ButtonGroup } from "@autumn/ui";
import { CustomizePlanButton } from "@/components/forms/shared/CustomizePlanButton";
import {
	type PlanRowAction,
	PlanRowActionsMenu,
} from "@/components/forms/shared/PlanRowActionsMenu";

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
			<CustomizePlanButton
				onClick={onCustomize}
				isCustom={isCustom}
				variant="secondary"
			/>
			{actions.length > 0 && (
				<PlanRowActionsMenu actions={actions} variant="secondary" />
			)}
		</ButtonGroup>
	);
}
