import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import {
	getStripeConnectViewAsLink,
	getStripeProductLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";

/** Builds a Stripe product dashboard URL, using the admin connect view-as path when available. */
export const useStripeProductLink = () => {
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();

	return (productId: string) => {
		if (isAdmin && masterStripeAccount?.id && stripeAccount?.id) {
			return getStripeConnectViewAsLink({
				masterAccountId: masterStripeAccount.id,
				connectedAccountId: stripeAccount.id,
				env,
				path: `products/${productId}`,
			});
		}
		return getStripeProductLink({
			productId,
			env,
			accountId: stripeAccount?.id,
		});
	};
};
