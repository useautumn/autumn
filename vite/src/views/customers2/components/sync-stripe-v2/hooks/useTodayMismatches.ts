import type { SyncProposalV2 } from "@autumn/shared";
import { useVerifyStripeQuery } from "@/views/customers2/components/verify-stripe/hooks/useVerifyStripeQuery";

export const useTodayMismatches = ({
	proposal,
}: {
	proposal: SyncProposalV2;
}) => {
	const { subscriptions, isLoading } = useVerifyStripeQuery();
	return {
		mismatches: subscriptions.find(
			(subscription) =>
				subscription.stripe_subscription_id === proposal.stripe_subscription_id,
		)?.mismatches,
		isVerifying: isLoading,
	};
};
