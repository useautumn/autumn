import type { FullCustomer } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerScheduleQueryOptions } from "@/views/customers/customer/hooks/useCustomerScheduleQueryOptions";
import { useSyncProposalsV2QueryOptions } from "@/views/customers2/components/sync-stripe-v2/hooks/useSyncProposalsV2";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { decideSetPlansEntry } from "../utils/decideSetPlansEntry";

/** Loads what Set Plans waits on while the customer page is open, so it opens
 * without a blank sheet: the saved schedule, and Stripe's view only for the picker. */
export const usePrefetchSetPlans = () => {
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

	useQuery(useCustomerScheduleQueryOptions());
	useQuery({
		...queryOptions,
		enabled: showsPicker,
		refetchOnWindowFocus: false,
	});
};
