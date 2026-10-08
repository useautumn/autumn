import { resolveCopySourceScope } from "@/components/forms/customer-state/customerStateUtils";
import {
	CopyExistingPlansRow,
	copyExistingPlansTooltip,
} from "@/components/forms/shared/plan-tray/CopyExistingPlansRow";
import { useCustomerStateContext } from "../CustomerStateProvider";

/** Seeds the opening phase with the customer's current plans at this row's scope. */
export function CopyExistingPlansButton({
	phaseIndex,
	planIndex,
	entityId,
	scopeLabel,
}: {
	phaseIndex: number;
	planIndex: number;
	entityId: string | null;
	/** Absent when the customer has no entities, so scope isn't a choice. */
	scopeLabel?: string;
}) {
	const { formValues, existingPlans, handleCopyExistingPlans, isPhaseLocked } =
		useCustomerStateContext();

	// Copying fills this row alone, so other plans in the phase don't block it.
	const copySource = resolveCopySourceScope({
		existingPlans,
		phasePlans: formValues.phases[phaseIndex]?.plans ?? [],
		entityId,
	});

	if (phaseIndex !== 0 || !copySource || isPhaseLocked({ phaseIndex })) {
		return null;
	}

	return (
		<CopyExistingPlansRow
			tooltip={copyExistingPlansTooltip({
				isFallback: copySource.isFallback,
				scopeLabel,
			})}
			onCopy={() =>
				handleCopyExistingPlans({ planIndex, entityId: copySource.entityId })
			}
		/>
	);
}
