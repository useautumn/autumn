import type {
	CustomerStatePlan,
	PlanLocation,
} from "@/components/forms/customer-state/customerStateSchema";
import type { PlanRowAction } from "@/components/forms/shared/PlanRowActionsMenu";
import { PlanTraySelectedRow } from "@/components/forms/shared/plan-tray/PlanTraySelectedRow";
import { useCustomerStateContext } from "../../CustomerStateProvider";
import { CustomerStatePlanQuantities } from "../CustomerStatePlanQuantities";
import { NotFoundBadge } from "../NotFoundBadge";

export function SelectedPlanTrayRow({
	location,
	plan,
	readOnly = false,
	onCustomize,
	onRemove,
	actions = [],
}: {
	location: PlanLocation;
	plan: CustomerStatePlan;
	readOnly?: boolean;
	onCustomize?: () => void;
	onRemove?: () => void;
	actions?: PlanRowAction[];
}) {
	const { products, planNotFoundReasons } = useCustomerStateContext();
	const product = products.find(({ id }) => id === plan.productId);

	return (
		<PlanTraySelectedRow
			productId={plan.productId}
			product={product}
			items={plan.items}
			isCustom={plan.isCustom}
			badge={<NotFoundBadge reasons={planNotFoundReasons(location)} />}
			actions={actions}
			onCustomize={onCustomize}
			onRemove={onRemove}
		>
			<CustomerStatePlanQuantities
				location={location}
				plan={plan}
				product={product}
				readOnly={readOnly}
			/>
		</PlanTraySelectedRow>
	);
}
