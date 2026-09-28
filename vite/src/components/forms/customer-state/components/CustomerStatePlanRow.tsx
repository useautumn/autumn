import {
	ArrowsLeftRightIcon,
	CopySimpleIcon,
	InfinityIcon,
} from "@phosphor-icons/react";
import { CopyExistingPlansButton } from "@/components/forms/customer-state/components/CopyExistingPlansButton";
import { getUsedGroupKeys } from "@/components/forms/customer-state/customerStateUtils";
import { findPreviousPhasePlan } from "@/components/forms/customer-state/useCustomerStateHandlers";
import { usePlanScopeField } from "@/components/forms/shared";
import {
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
		form,
		formValues,
		products,
		handleRemovePlan,
		handleCopyFromPreviousPhase,
		handleMakeUnscheduled,
		isPhaseLocked,
		setEditingPlan,
		canMakeUnscheduled,
		handleSelectPlanProduct,
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
			form.setFieldValue(
				`phases[${phaseIndex}].plans[${planIndex}].entityId`,
				nextEntityId ?? null,
			),
	});

	if (!plan) return null;

	if (!plan.productId) {
		const usedKeys = getUsedGroupKeys({
			plans: formValues.phases[phaseIndex]?.plans ?? [],
			products,
			excludePlanIndex: planIndex,
			entityId: plan.entityId ?? null,
		});
		const selectedProductIdsInPhase = new Set(
			formValues.phases[phaseIndex]?.plans
				.filter((_, index) => index !== planIndex)
				.map((other) => other.productId)
				.filter(Boolean),
		);

		return (
			<PlanPickerTrayRow
				scope={{
					value: plan.entityId ?? null,
					onChange: (entityId) =>
						form.setFieldValue(
							`phases[${phaseIndex}].plans[${planIndex}].entityId`,
							entityId,
						),
				}}
				products={products.filter((product) => !product.archived)}
				usedKeys={usedKeys}
				siblingProductIds={selectedProductIdsInPhase}
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
				onSelect={(productId) =>
					handleSelectPlanProduct({ location, productId })
				}
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
		...(!isLocked && hasEntities
			? [
					{
						label: "Move to",
						icon: <ArrowsLeftRightIcon size={ROW_ACTION_ICON_SIZE} />,
						submenu: scopeMenu,
					},
				]
			: []),
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
