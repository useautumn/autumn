import type { FullCustomer } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useSyncProposalsV2QueryOptions } from "@/views/customers2/components/sync-stripe-v2/hooks/useSyncProposalsV2";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { decideSetPlansEntry } from "../utils/decideSetPlansEntry";

/** Loads Stripe's view of the subscriptions while the customer page is open,
 * only for customers who will see the picker, so it opens without skeletons. */
export const usePrefetchSubscriptionPicker = () => {
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();
	const fullCustomer = customer as FullCustomer | undefined;
	const customerId = fullCustomer?.id ?? "";
	const queryOptions = useSyncProposalsV2QueryOptions({ customerId });

	const showsPicker =
		Boolean(customerId) &&
		decideSetPlansEntry({
			customerProducts: fullCustomer?.customer_products ?? [],
			entityId,
		}).kind === "choose_subscription";

	useQuery({
		...queryOptions,
		enabled: showsPicker,
		refetchOnWindowFocus: false,
	});
};
