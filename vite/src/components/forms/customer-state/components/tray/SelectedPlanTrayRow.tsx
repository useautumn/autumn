import { PencilSimpleIcon, XIcon } from "@phosphor-icons/react";
import type {
	CustomerStatePlan,
	PlanLocation,
} from "@/components/forms/customer-state/customerStateSchema";
import {
	type PlanRowAction,
	PlanRowActionsMenu,
	ROW_ACTION_ICON_SIZE,
} from "@/components/forms/shared/PlanRowActionsMenu";
import type { PlanRowScope } from "@/components/forms/shared/ScopedPlanRow";
import { useCustomerStateContext } from "../../CustomerStateProvider";
import { CustomerStatePlanQuantities } from "../CustomerStatePlanQuantities";
import { NotFoundBadge } from "../NotFoundBadge";
import { PlanTrayLine } from "./PlanTrayLine";
import { PlanTrayRow } from "./PlanTrayRow";

/** Customize leads and remove closes the row menu, with location-specific actions between. */
const buildRowActions = ({
	onCustomize,
	onRemove,
	actions,
}: {
	onCustomize?: () => void;
	onRemove?: () => void;
	actions: PlanRowAction[];
}): PlanRowAction[] => [
	...(onCustomize
		? [
				{
					label: "Customize",
					icon: <PencilSimpleIcon size={ROW_ACTION_ICON_SIZE} />,
					onSelect: onCustomize,
				},
			]
		: []),
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
				isCustom={plan.isCustom}
				scope={scope?.picker}
				badge={<NotFoundBadge reasons={planNotFoundReasons(location)} />}
				controls={
					<PlanRowActionsMenu
						actions={buildRowActions({ onCustomize, onRemove, actions })}
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
