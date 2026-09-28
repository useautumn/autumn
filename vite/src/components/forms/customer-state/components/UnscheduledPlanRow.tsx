import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { getUnscheduledUsedGroupKeys } from "@/components/forms/customer-state/customerStateUtils";
import { usePlanScopeField } from "@/components/forms/shared";
import { ROW_ACTION_ICON_SIZE } from "@/components/forms/shared/PlanRowActionsMenu";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanPickerTrayRow } from "./tray/PlanPickerTrayRow";
import { SelectedPlanTrayRow } from "./tray/SelectedPlanTrayRow";

export function UnscheduledPlanRow({ planIndex }: { planIndex: number }) {
	const {
		formValues,
		products,
		handleRemoveUnscheduledPlan,
		setEditingPlan,
		handleSelectPlanProduct,
		handleSelectPlanScope,
	} = useCustomerStateContext();
	const location = { location: "unscheduled", planIndex } as const;

	const plan = formValues.unscheduledPlans[planIndex];
	const { hasEntities, scopeMenu } = usePlanScopeField({
		planEntityId: plan?.entityId,
		onChange: (nextEntityId) =>
			handleSelectPlanScope({ location, entityId: nextEntityId ?? null }),
	});

	if (!plan) return null;

	if (!plan.productId) {
		const usedKeys = getUnscheduledUsedGroupKeys({
			phases: formValues.phases,
			unscheduledPlans: formValues.unscheduledPlans,
			planIndex,
			products,
			entityId: plan.entityId ?? null,
		});
		const siblingProductIds = new Set(
			formValues.unscheduledPlans
				.filter((_, index) => index !== planIndex)
				.map((other) => other.productId)
				.filter(Boolean),
		);

		return (
			<PlanPickerTrayRow
				scope={{
					value: plan.entityId ?? null,
					onChange: (entityId) => handleSelectPlanScope({ location, entityId }),
				}}
				products={products.filter((product) => !product.archived)}
				usedKeys={usedKeys}
				siblingProductIds={siblingProductIds}
				onSelect={(productId) =>
					handleSelectPlanProduct({ location, productId })
				}
			/>
		);
	}

	return (
		<SelectedPlanTrayRow
			location={location}
			plan={plan}
			actions={
				hasEntities
					? [
							{
								label: "Move to",
								icon: <ArrowsLeftRightIcon size={ROW_ACTION_ICON_SIZE} />,
								submenu: scopeMenu,
							},
						]
					: []
			}
			onCustomize={() => setEditingPlan(location)}
			onRemove={() => handleRemoveUnscheduledPlan({ planIndex })}
		/>
	);
}
