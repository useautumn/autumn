import type { ReactNode } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { getUsedGroupKeys } from "../customerStateUtils";
import { CustomerStatePlanRow } from "./CustomerStatePlanRow";
import { PlanScopeGroups } from "./tray/PlanScopeGroups";
import { PlanSection } from "./tray/PlanSection";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";
import { useAddPlanScope } from "./tray/useAddPlanScope";

/** A phase's declared plans grouped by scope, closed by "Add plan". */
export function CustomerStatePhasePlans({
	phaseIndex,
	header,
}: {
	phaseIndex: number;
	header?: ReactNode;
}) {
	const { formValues, products, isPhaseLocked, handleAddPlan } =
		useCustomerStateContext();
	const isLocked = isPhaseLocked({ phaseIndex });
	const addScope = useAddPlanScope({ disabled: isLocked });

	const phase = formValues.phases[phaseIndex];
	if (!phase) return null;

	const usedKeys = getUsedGroupKeys({
		plans: phase.plans,
		products,
		entityId: addScope.entityId,
	});
	const allPlansAdded = products
		.filter((product) => !product.archived)
		.every((product) =>
			usedKeys.has(getProductGroupKey({ productId: product.id, products })),
		);

	return (
		<PlanSection header={header}>
			<PlanScopeGroups
				plans={phase.plans}
				showHeaders={addScope.hasEntities}
				renderPlan={(planIndex) => (
					<CustomerStatePlanRow
						key={`plan-${phaseIndex}-${planIndex}-${phase.plans[planIndex]?.productId || "empty"}`}
						phaseIndex={phaseIndex}
						planIndex={planIndex}
					/>
				)}
			/>
			<PlanTrayAddRow
				label="Add plan"
				scope={addScope.picker}
				onClick={() =>
					handleAddPlan({ phaseIndex, entityId: addScope.entityId })
				}
				disabled={allPlansAdded || isLocked}
			/>
		</PlanSection>
	);
}
