import type { ReactNode } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { getUsedGroupKeys } from "../customerStateUtils";
import { CustomerStatePlanRow } from "./CustomerStatePlanRow";
import { PlanScopeGroups } from "./tray/PlanScopeGroups";
import { PlanSection } from "./tray/PlanSection";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";

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
	const { hasEntities } = useScopeEntitySearch({ selectedEntityId: undefined });

	const phase = formValues.phases[phaseIndex];
	if (!phase) return null;

	const usedKeys = getUsedGroupKeys({
		plans: phase.plans,
		products,
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
				showHeaders={hasEntities}
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
				onClick={() => handleAddPlan({ phaseIndex })}
				disabled={isLocked || (!hasEntities && allPlansAdded)}
			/>
		</PlanSection>
	);
}
