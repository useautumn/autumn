import type {
	SetPlansPreviewWarning,
	StripeSubscriptionScope,
} from "@autumn/shared";
import { boldText, plainText } from "@autumn/shared";
import { warningText } from "./warningText";

export const otherSubscriptionsWarnings = ({
	stripeSubscriptionScope,
}: {
	stripeSubscriptionScope?: StripeSubscriptionScope;
}): Omit<SetPlansPreviewWarning, "severity">[] => {
	const otherCount =
		stripeSubscriptionScope?.otherStripeSubscriptionIds.length ?? 0;
	if (otherCount === 0) return [];

	const subscriptions = otherCount === 1 ? "subscription" : "subscriptions";
	return [
		{
			type: "other_subscriptions_unaffected",
			...warningText([
				plainText("Plans on"),
				boldText(`${otherCount} other ${subscriptions}`),
				plainText("aren't affected."),
			]),
		},
	];
};
