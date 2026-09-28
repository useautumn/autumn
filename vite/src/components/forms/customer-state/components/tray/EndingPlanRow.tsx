import type { CustomerStatePlan } from "@/components/forms/customer-state/customerStateSchema";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCustomerStateContext } from "../../CustomerStateProvider";
import { PlanTrayLine } from "./PlanTrayLine";
import { PlanTrayRow } from "./PlanTrayRow";

/** A plan the phase before held that this phase doesn't declare, shown read-only. */
export function EndingPlanRow({ plan }: { plan: CustomerStatePlan }) {
	const { products } = useCustomerStateContext();
	const entityId = plan.entityId ?? undefined;
	const { selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId,
	});

	return (
		<PlanTrayRow dimmed>
			<PlanTrayLine
				productId={plan.productId}
				product={products.find(({ id }) => id === plan.productId)}
				items={plan.items}
				isCustom={plan.isCustom}
				scopeLabel={entityId && (selectedEntity?.name || entityId)}
				status="ends"
				controls={<span aria-hidden className="size-6 shrink-0" />}
			/>
		</PlanTrayRow>
	);
}
