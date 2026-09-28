import type { SyncProposalV2 } from "@autumn/shared";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import {
	getStripeConnectViewAsLink,
	getStripeSubLink,
	getStripeSubScheduleLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";

export function useOpenInStripe({ proposal }: { proposal: SyncProposalV2 }) {
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();

	const subscriptionId = proposal.stripe_subscription_id;
	const scheduleId = proposal.stripe_schedule_id;
	const stripeAccountId = stripeAccount?.id;
	const masterAccountId = masterStripeAccount?.id;

	const buildUrl = () => {
		if (isAdmin && masterAccountId && stripeAccountId) {
			const path = subscriptionId
				? `subscriptions/${subscriptionId}`
				: `subscription_schedules/${scheduleId}`;
			return getStripeConnectViewAsLink({
				masterAccountId,
				connectedAccountId: stripeAccountId,
				env,
				path,
			});
		}
		if (subscriptionId) {
			return getStripeSubLink({
				subscriptionId,
				env,
				accountId: stripeAccountId,
			});
		}
		return getStripeSubScheduleLink({
			scheduledId: scheduleId ?? "",
			env,
			accountId: stripeAccountId,
		});
	};

	const hasStripeObject = Boolean(subscriptionId || scheduleId);

	return {
		hasStripeObject,
		openInStripe: () => {
			if (hasStripeObject) window.open(buildUrl(), "_blank");
		},
	};
}
