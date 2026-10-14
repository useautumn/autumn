import { resolveCopySourceScope } from "@/components/forms/customer-state/customerStateUtils";
import {
	CopyExistingPlansRow,
	copyExistingPlansTooltip,
} from "@/components/forms/shared/plan-tray/CopyExistingPlansRow";
import { useCustomerStateContext } from "../CustomerStateProvider";

export function CopyExistingPlansButton({
	phaseIndex,
	planIndex,
	entityId,
	scopeLabel,
}: {
	phaseIndex: number;
	planIndex: number;
	entityId: string | null;
	scopeLabel?: string;
}) {
	const { formValues, existingPlans, handleCopyExistingPlans, isPhaseLocked } =
		useCustomerStateContext();

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
