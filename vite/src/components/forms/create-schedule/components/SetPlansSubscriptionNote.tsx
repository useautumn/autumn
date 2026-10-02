import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function SetPlansSubscriptionNote() {
	const { subscriptionTarget } = useCreateScheduleFormContext();
	if (!subscriptionTarget) return null;

	const { planName, stripeObjectId, details } = subscriptionTarget;
	const subscriptionName = planName
		? `${planName} subscription`
		: `subscription ${stripeObjectId}`;

	return (
		<p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
			<span className="shrink-0">Editing the</span>
			<StripeIcon size={14} className="shrink-0 text-indigo-500" />
			<span className="truncate font-medium text-foreground">
				{subscriptionName}
			</span>
			{details && (
				<span className="shrink-0 text-tertiary-foreground">· {details}</span>
			)}
		</p>
	);
}
