import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionContext } from "@/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";

export const computeSubscriptionUpdateTrialDetails = ({
	ctx,
	subscriptionUpdateContext,
}: {
	ctx: AutumnContext;
	subscriptionUpdateContext: UpdateSubscriptionContext;
}) => {
	return {};
};
