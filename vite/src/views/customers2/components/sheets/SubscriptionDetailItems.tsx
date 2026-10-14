import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import {
	ReadOnlyPlanItems,
	type ReadOnlyPlanItemsProps,
} from "./ReadOnlyPlanItems";

export function SubscriptionDetailItems(props: ReadOnlyPlanItemsProps) {
	return (
		<SheetSection>
			<ReadOnlyPlanItems {...props} />
		</SheetSection>
	);
}
