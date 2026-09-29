import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import {
	getStripeConnectViewAsLink,
	getStripeDashboardLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";

/** Builds a Stripe dashboard URL for a path, using the admin connect view-as path when available. */
export const useStripeDashboardLink = () => {
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();

	return (path: string) => {
		if (isAdmin && masterStripeAccount?.id && stripeAccount?.id) {
			return getStripeConnectViewAsLink({
				masterAccountId: masterStripeAccount.id,
				connectedAccountId: stripeAccount.id,
				env,
				path,
			});
		}
		return getStripeDashboardLink({
			env,
			accountId: stripeAccount?.id,
			path,
		});
	};
};
