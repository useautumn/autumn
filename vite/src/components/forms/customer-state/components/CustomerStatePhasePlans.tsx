import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { areAllPlansAdded } from "../customerStateUtils";
import { planRowKey } from "../utils/planRowKey";
import { CustomerStatePlanRow } from "./CustomerStatePlanRow";
import { PlanScopeGroups } from "./tray/PlanScopeGroups";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";

export function CustomerStatePhasePlans({
	phaseIndex,
	header,
	insetForRail = false,
}: {
	phaseIndex: number;
	header?: ReactNode;
	insetForRail?: boolean;
}) {
	const { formValues, products, isPhaseLocked, handleAddPlan } =
		useCustomerStateContext();
	const isLocked = isPhaseLocked({ phaseIndex });
	const { hasEntities } = useScopeEntitySearch({ selectedEntityId: undefined });

	const phase = formValues.phases[phaseIndex];
	if (!phase) return null;

	const allPlansAdded = areAllPlansAdded({ plans: phase.plans, products });

	return (
		<div className="flex flex-col gap-1.5">
			{header}
			<div className={cn(insetForRail && "pl-8.5")}>
				<PlanScopeGroups
					plans={phase.plans}
					showHeaders={hasEntities}
					renderPlan={(planIndex) => (
						<CustomerStatePlanRow
							key={planRowKey({
								section: `plan-${phaseIndex}`,
								planIndex,
								productId: phase.plans[planIndex]?.productId,
							})}
							phaseIndex={phaseIndex}
							planIndex={planIndex}
						/>
					)}
					addRow={
						<PlanTrayAddRow
							label="Add plan"
							onClick={() => handleAddPlan({ phaseIndex })}
							disabled={isLocked || (!hasEntities && allPlansAdded)}
						/>
					}
				/>
			</div>
		</div>
	);
}
