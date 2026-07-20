import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import {
	ReadOnlyPlanItems,
	type ReadOnlyPlanItemsProps,
} from "./ReadOnlyPlanItems";

/** Read-only price + feature rows for detail sheets (subscription, license). */
export function SubscriptionDetailItems(props: ReadOnlyPlanItemsProps) {
	return (
		<SheetSection>
			<ReadOnlyPlanItems {...props} />
		</SheetSection>
	);
}
