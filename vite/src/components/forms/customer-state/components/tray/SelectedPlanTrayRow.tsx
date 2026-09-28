import { XIcon } from "@phosphor-icons/react";
import type {
	CustomerStatePlan,
	PlanLocation,
} from "@/components/forms/customer-state/customerStateSchema";
import {
	type PlanRowAction,
	ROW_ACTION_ICON_SIZE,
} from "@/components/forms/shared/PlanRowActionsMenu";
import type { PlanRowScope } from "@/components/forms/shared/ScopedPlanRow";
import { useCustomerStateContext } from "../../CustomerStateProvider";
import { CustomerStatePlanQuantities } from "../CustomerStatePlanQuantities";
import { NotFoundBadge } from "../NotFoundBadge";
import { PlanRowControls } from "./PlanRowControls";
import { PlanTrayLine } from "./PlanTrayLine";
import { PlanTrayRow } from "./PlanTrayRow";

/** Location-specific actions first, remove last. */
const buildRowActions = ({
	onRemove,
	actions,
}: {
	onRemove?: () => void;
	actions: PlanRowAction[];
}): PlanRowAction[] => [
	...actions,
	...(onRemove
		? [
				{
					label: "Remove",
					icon: <XIcon size={ROW_ACTION_ICON_SIZE} />,
					onSelect: onRemove,
				},
			]
		: []),
];

export function SelectedPlanTrayRow({
	location,
	plan,
	scope,
	readOnly = false,
	onCustomize,
	onRemove,
	actions = [],
}: {
	location: PlanLocation;
	plan: CustomerStatePlan;
	scope?: PlanRowScope;
	readOnly?: boolean;
	onCustomize?: () => void;
	onRemove?: () => void;
	actions?: PlanRowAction[];
}) {
	const { products, planNotFoundReasons } = useCustomerStateContext();
	const product = products.find(({ id }) => id === plan.productId);

	return (
		<PlanTrayRow>
			<PlanTrayLine
				productId={plan.productId}
				product={product}
				items={plan.items}
				anchor={scope?.picker}
				badge={<NotFoundBadge reasons={planNotFoundReasons(location)} />}
				controls={
					<PlanRowControls
						isCustom={plan.isCustom}
						onCustomize={onCustomize}
						actions={buildRowActions({ onRemove, actions })}
					/>
				}
			/>
			<CustomerStatePlanQuantities
				location={location}
				plan={plan}
				product={product}
				readOnly={readOnly}
			/>
		</PlanTrayRow>
	);
}
