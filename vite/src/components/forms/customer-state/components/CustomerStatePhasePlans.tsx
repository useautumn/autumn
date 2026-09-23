import { InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { getUsedGroupKeys } from "../customerStateUtils";
import { CustomerStatePlanRow } from "./CustomerStatePlanRow";

/** A phase's plan rows and its "Add plan" action. */
export function CustomerStatePhasePlans({
	phaseIndex,
}: {
	phaseIndex: number;
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
		<div className="space-y-1.5">
			{phase.plans.map((plan, planIndex) => (
				<CustomerStatePlanRow
					key={`plan-${phaseIndex}-${planIndex}-${plan.productId || "empty"}`}
					phaseIndex={phaseIndex}
					planIndex={planIndex}
				/>
			))}
			<InlineAction
				icon={<PlusIcon size={11} />}
				onClick={() => handleAddPlan({ phaseIndex })}
				disabled={allPlansAdded || isPhaseLocked({ phaseIndex })}
			>
				Add plan
			</InlineAction>
		</div>
	);
}
