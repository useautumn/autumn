import { UpdateSubscriptionIntent } from "@autumn/shared";

export const setupIgnoreProrationBehavior = ({
	intent,
	isOneOffAttach,
}: {
	intent?: UpdateSubscriptionIntent;
	isOneOffAttach?: boolean;
}): boolean => {
	if (intent === UpdateSubscriptionIntent.ManualTopUp) return true;
	if (isOneOffAttach) return true;
	return false;
};
