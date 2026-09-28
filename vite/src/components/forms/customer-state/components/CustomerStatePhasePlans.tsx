import type { ReactNode } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { getUsedGroupKeys } from "../customerStateUtils";
import { CustomerStatePlanRow } from "./CustomerStatePlanRow";
import { PlanSection } from "./tray/PlanSection";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";

/** A phase's declared plans on one surface, closed by "Add plan". */
export function CustomerStatePhasePlans({
	phaseIndex,
	header,
}: {
	phaseIndex: number;
	header?: ReactNode;
}) {
	const { formValues, products, isPhaseLocked, handleAddPlan } =
		useCustomerStateContext();

	const phase = formValues.phases[phaseIndex];
	if (!phase) return null;

	// A new row starts customer-level, so that's the scope that can run out of plans.
	const customerLevelKeys = getUsedGroupKeys({ plans: phase.plans, products });
	const allPlansAdded = products
		.filter((product) => !product.archived)
		.every((product) =>
			customerLevelKeys.has(
				getProductGroupKey({ productId: product.id, products }),
			),
		);

	return (
		<PlanSection header={header}>
			{phase.plans.map((plan, planIndex) => (
				<CustomerStatePlanRow
					key={`plan-${phaseIndex}-${planIndex}-${plan.productId || "empty"}`}
					phaseIndex={phaseIndex}
					planIndex={planIndex}
				/>
			))}
			<PlanTrayAddRow
				label="Add plan"
				onClick={() => handleAddPlan({ phaseIndex })}
				disabled={allPlansAdded || isPhaseLocked({ phaseIndex })}
			/>
		</PlanSection>
	);
}
