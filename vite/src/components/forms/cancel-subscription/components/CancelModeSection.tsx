import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useCancelSubscriptionContext } from "../context/CancelSubscriptionContext";

export function CancelModeSection() {
	const { cancelAction, setCancelAction, canChooseCancelMode } =
		useCancelSubscriptionContext();

	if (!canChooseCancelMode) return null;

	return (
		<SheetSection title="Cancel Timing" withSeparator>
			<GroupedTabButton
				value={cancelAction}
				onValueChange={(value) => setCancelAction(value)}
				options={[
					{
						value: "cancel_end_of_cycle",
						label: "End of cycle",
					},
					{
						value: "cancel_immediately",
						label: "Immediately",
					},
				]}
			/>
		</SheetSection>
	);
}
