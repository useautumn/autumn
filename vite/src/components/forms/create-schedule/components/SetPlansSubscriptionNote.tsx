import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function SetPlansSubscriptionNote() {
	const { subscriptionTarget } = useCreateScheduleFormContext();
	const setSheet = useSheetStore((state) => state.setSheet);
	if (!subscriptionTarget) return null;

	const backToPicker = () =>
		setSheet({
			type: "create-schedule-choose-subscription",
			data: { selectedKey: subscriptionTarget.key },
		});

	return (
		<p className="mt-1 flex items-center gap-1.5 text-xs text-tertiary-foreground">
			<span>Editing</span>
			<code className="truncate font-mono">{subscriptionTarget.label}</code>
			{subscriptionTarget.canChange && (
				<button
					type="button"
					onClick={backToPicker}
					className="shrink-0 cursor-pointer text-primary hover:underline"
				>
					Change
				</button>
			)}
		</p>
	);
}
