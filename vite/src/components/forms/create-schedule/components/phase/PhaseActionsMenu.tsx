import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import {
	type PlanRowAction,
	PlanRowActionsMenu,
	ROW_ACTION_ICON_SIZE,
} from "@/components/forms/shared/PlanRowActionsMenu";

/** Inserting needs this phase editable; removing needs a later phase that hasn't started. */
export function PhaseActionsMenu({
	phaseIndex,
	hasStarted,
	isLocked,
}: {
	phaseIndex: number;
	hasStarted: boolean;
	isLocked: boolean;
}) {
	const { handleInsertPhase, handleRemovePhase } = useCustomerStateContext();
	const canRemove = phaseIndex > 0 && !hasStarted;

	const actions: PlanRowAction[] = [
		...(isLocked
			? []
			: [
					{
						label: "Insert phase after",
						icon: <PlusIcon size={ROW_ACTION_ICON_SIZE} />,
						onSelect: () => handleInsertPhase({ afterIndex: phaseIndex }),
					},
				]),
		...(canRemove
			? [
					{
						label: "Remove phase",
						icon: <TrashIcon size={ROW_ACTION_ICON_SIZE} />,
						onSelect: () => handleRemovePhase({ phaseIndex }),
					},
				]
			: []),
	];

	return <PlanRowActionsMenu actions={actions} label="Phase actions" />;
}
