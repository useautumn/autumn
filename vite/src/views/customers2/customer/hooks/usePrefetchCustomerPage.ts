import { useQuery } from "@tanstack/react-query";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import {
	useCustomerQueryOptions,
	useIncludeExpiredLoose,
} from "@/views/customers/customer/hooks/useCustomerQueryOptions";
import { usePreloadEntityView } from "./usePreloadEntityView";

/**
 * Starts a customer page's data from the layout on a direct load, in parallel
 * with the org and the page chunk, instead of after both have arrived.
 */
export const usePrefetchCustomerPage = ({
	customerId,
}: {
	customerId: string | undefined;
}) => {
	const { entityId } = useEntity();
	const includeExpiredLoose = useIncludeExpiredLoose();
	const customerQueryOptions = useCustomerQueryOptions();

	useQuery({
		...customerQueryOptions({ customerId, entityId, includeExpiredLoose }),
		enabled: Boolean(customerId),
	});
	usePreloadEntityView({ customerId, entityId: customerId ? entityId : null });
};
