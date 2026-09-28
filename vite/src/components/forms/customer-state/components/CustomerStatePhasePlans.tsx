import type { ReactNode } from "react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { cn } from "@/lib/utils";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { getUsedGroupKeys } from "../customerStateUtils";
import { CustomerStatePlanRow } from "./CustomerStatePlanRow";
import { PlanScopeGroups } from "./tray/PlanScopeGroups";
import { PlanTrayAddRow } from "./tray/PlanTrayAddRow";

/** A phase's declared plans grouped by scope, closed by "Add plan". */
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
		<div className="flex flex-col gap-1.5">
			{header}
			<div className={cn("flex flex-col", insetForRail && "pl-8.5")}>
				<PlanScopeGroups
					plans={phase.plans}
					showHeaders={hasEntities}
					renderPlan={(planIndex) => (
						<CustomerStatePlanRow
							key={`plan-${phaseIndex}-${planIndex}`}
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
			</div>
		</div>
	);
}
