import type { ReactNode } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { getUsedGroupKeys } from "../customerStateUtils";
import { derivePhasePlanChanges } from "../utils/phasePlanStatus";
import { CustomerStatePlanRow } from "./CustomerStatePlanRow";
import { EndingPlanRow } from "./tray/EndingPlanRow";
import { PlanTray } from "./tray/PlanTray";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";

/** A phase's plans as a tray: declared rows, the plans it ends, then "Add plan". */
export function CustomerStatePhasePlans({
	phaseIndex,
	header,
}: {
	phaseIndex: number;
	header?: ReactNode;
}) {
	const {
		formValues,
		products,
		existingPlans,
		showsPlanChanges,
		isPhaseLocked,
		handleAddPlan,
	} = useCustomerStateContext();

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

	const { statuses, endingPlans } = derivePhasePlanChanges({
		phases: formValues.phases,
		phaseIndex,
		existingPlans,
		ongoingPlans: formValues.unscheduledPlans,
	});

	return (
		<PlanTray header={header}>
			{phase.plans.map((plan, planIndex) => (
				<CustomerStatePlanRow
					key={`plan-${phaseIndex}-${planIndex}-${plan.productId || "empty"}`}
					phaseIndex={phaseIndex}
					planIndex={planIndex}
					status={
						showsPlanChanges ? (statuses[planIndex] ?? undefined) : undefined
					}
				/>
			))}
			{showsPlanChanges &&
				endingPlans.map((plan) => (
					<EndingPlanRow
						key={`ending-${phaseIndex}-${plan.productId}-${plan.entityId ?? ""}`}
						plan={plan}
					/>
				))}
			<PlanTrayAddRow
				label="Add plan"
				onClick={() => handleAddPlan({ phaseIndex })}
				disabled={allPlansAdded || isPhaseLocked({ phaseIndex })}
			/>
		</PlanTray>
	);
}
