import type {
	SetPlansPreviewWarning,
	StripeSubscriptionScope,
} from "@autumn/shared";

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
			message: `Plans on ${otherCount} other ${subscriptions} aren't affected.`,
		},
	];
};
