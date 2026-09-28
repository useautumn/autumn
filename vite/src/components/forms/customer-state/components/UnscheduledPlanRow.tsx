import {
	filterUnarchivedProducts,
	getSiblingProductIds,
	getUnscheduledUsedGroupKeys,
} from "@/components/forms/customer-state/customerStateUtils";
import { usePlanScopeField } from "@/components/forms/shared";
import { buildMoveToAction } from "@/components/forms/shared/PlanRowActionsMenu";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { PlanPickerTrayRow } from "./tray/PlanPickerTrayRow";
import { SelectedPlanTrayRow } from "./tray/SelectedPlanTrayRow";

export function UnscheduledPlanRow({ planIndex }: { planIndex: number }) {
	const {
		form,
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

		return (
			<PlanPickerTrayRow
				scope={{
					value: plan.entityId ?? null,
					onChange: (entityId) => handleSelectPlanScope({ location, entityId }),
				}}
				products={filterUnarchivedProducts({ products })}
				usedKeys={usedKeys}
				siblingProductIds={getSiblingProductIds({
					plans: formValues.unscheduledPlans,
					planIndex,
				})}
				onSelect={(productId) =>
					handleSelectPlanProduct({ location, productId })
				}
				onDismiss={() => {
					const current = form.store.state.values.unscheduledPlans[planIndex];
					if (current && !current.productId) {
						handleRemoveUnscheduledPlan({ planIndex });
					}
				}}
			/>
		);
	}

	return (
		<SelectedPlanTrayRow
			location={location}
			plan={plan}
			actions={hasEntities ? [buildMoveToAction({ scopeMenu })] : []}
			onCustomize={() => setEditingPlan(location)}
			onRemove={() => handleRemoveUnscheduledPlan({ planIndex })}
		/>
	);
}
