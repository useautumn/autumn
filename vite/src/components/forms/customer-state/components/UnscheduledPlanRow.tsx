import { getUnscheduledUsedGroupKeys } from "@/components/forms/customer-state/customerStateUtils";
import { usePlanScopeField } from "@/components/forms/shared";
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
	} = useCustomerStateContext();
	const location = { location: "unscheduled", planIndex } as const;

	const plan = formValues.unscheduledPlans[planIndex];
	const { scope, selectedLabel } = usePlanScopeField({
		planEntityId: plan?.entityId,
		onChange: (nextEntityId) =>
			form.setFieldValue(
				`unscheduledPlans[${planIndex}].entityId`,
				nextEntityId ?? null,
			),
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
				scope={scope}
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
			status="ongoing"
			scope={scope}
			scopeLabel={plan.entityId ? selectedLabel : undefined}
			onCustomize={() => setEditingPlan(location)}
			onRemove={() => handleRemoveUnscheduledPlan({ planIndex })}
		/>
	);
}
