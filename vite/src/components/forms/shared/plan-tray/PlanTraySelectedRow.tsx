import type { ProductItem, ProductV2 } from "@autumn/shared";
import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	type PlanRowAction,
	ROW_ACTION_ICON_SIZE,
} from "@/components/forms/shared/PlanRowActionsMenu";
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

/** A chosen plan in the tray: name, price, ✏️ and ⋯, with its quantity rows beneath. */
export function PlanTraySelectedRow({
	productId,
	product,
	items,
	isCustom,
	badge,
	actions = [],
	onCustomize,
	onRemove,
	children,
}: {
	productId: string;
	product: ProductV2 | undefined;
	items: ProductItem[] | null;
	isCustom: boolean;
	badge?: ReactNode;
	actions?: PlanRowAction[];
	onCustomize?: () => void;
	onRemove?: () => void;
	children?: ReactNode;
}) {
	return (
		<PlanTrayRow>
			<PlanTrayLine
				productId={productId}
				product={product}
				items={items}
				badge={badge}
				controls={
					<PlanRowControls
						isCustom={isCustom}
						onCustomize={onCustomize}
						actions={buildRowActions({ onRemove, actions })}
					/>
				}
			/>
			{children}
		</PlanTrayRow>
	);
}
