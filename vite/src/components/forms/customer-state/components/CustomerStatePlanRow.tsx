import { CopySimpleIcon, InfinityIcon } from "@phosphor-icons/react";
import { CopyExistingPlansButton } from "@/components/forms/customer-state/components/CopyExistingPlansButton";
import {
	findPreviousPhasePlan,
	getUsedGroupKeys,
} from "@/components/forms/customer-state/customerStateUtils";
import { usePlanScopeField } from "@/components/forms/shared";
import {
	buildMoveToAction,
	type PlanRowAction,
	ROW_ACTION_ICON_SIZE,
} from "@/components/forms/shared/PlanRowActionsMenu";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanPickerTrayRow } from "./tray/PlanPickerTrayRow";
import { SelectedPlanTrayRow } from "./tray/SelectedPlanTrayRow";

export function CustomerStatePlanRow({
	phaseIndex,
	planIndex,
}: {
	phaseIndex: number;
	planIndex: number;
}) {
	const {
		formValues,
		products,
		handleRemovePlan,
		handleCopyFromPreviousPhase,
		handleMakeUnscheduled,
		isPhaseLocked,
		setEditingPlan,
		canMakeUnscheduled,
		handleSelectPlanScope,
	} = useCustomerStateContext();
	const location = { location: "phase", phaseIndex, planIndex } as const;

	const plan = formValues.phases[phaseIndex]?.plans[planIndex];
	const isOpeningPhase = phaseIndex === 0;
	const isLocked = isPhaseLocked({ phaseIndex });
	const { hasEntities, selectedLabel, scopeMenu } = usePlanScopeField({
		planEntityId: plan?.entityId,
		disabled: isLocked,
		disabledReason: "this phase has started",
		onChange: (nextEntityId) =>
			handleSelectPlanScope({ location, entityId: nextEntityId ?? null }),
	});

	if (!plan) return null;

	if (!plan.productId) {
		const phasePlans = formValues.phases[phaseIndex]?.plans ?? [];
		const usedKeys = getUsedGroupKeys({
			plans: phasePlans,
			products,
			excludePlanIndex: planIndex,
			entityId: plan.entityId ?? null,
		});

		return (
			<PlanPickerTrayRow
				location={location}
				plan={plan}
				plans={phasePlans}
				usedKeys={usedKeys}
				header={
					isOpeningPhase ? (
						<CopyExistingPlansButton
							phaseIndex={phaseIndex}
							planIndex={planIndex}
							entityId={plan.entityId ?? null}
							scopeLabel={hasEntities ? selectedLabel : undefined}
						/>
					) : undefined
				}
				disabled={isLocked}
				onDismiss={() => handleRemovePlan({ phaseIndex, planIndex })}
			/>
		);
	}

	const canCopyFromPreviousPhase =
		!isLocked &&
		Boolean(
			findPreviousPhasePlan({ phases: formValues.phases, phaseIndex, plan }),
		);
	const rowActions: PlanRowAction[] = [
		...(canCopyFromPreviousPhase
			? [
					{
						label: "Copy from previous phase",
						icon: <CopySimpleIcon size={ROW_ACTION_ICON_SIZE} />,
						onSelect: () =>
							handleCopyFromPreviousPhase({ phaseIndex, planIndex }),
					},
				]
			: []),
		...(!isLocked && hasEntities ? [buildMoveToAction({ scopeMenu })] : []),
		...(!isLocked && canMakeUnscheduled
			? [
					{
						label: "Make ongoing",
						icon: <InfinityIcon size={ROW_ACTION_ICON_SIZE} />,
						onSelect: () => handleMakeUnscheduled({ phaseIndex, planIndex }),
					},
				]
			: []),
	];

	return (
		<SelectedPlanTrayRow
			location={location}
			plan={plan}
			readOnly={isLocked}
			actions={rowActions}
			onCustomize={isLocked ? undefined : () => setEditingPlan(location)}
			onRemove={
				isLocked ? undefined : () => handleRemovePlan({ phaseIndex, planIndex })
			}
		/>
	);
}
