import type { QueryClient } from "@tanstack/react-query";

/**
 * Refresh everything a successful attach / subscription update can change on
 * the customer page: the customer itself and its license pools (license sets,
 * quantities move with the subscription).
 */
export const invalidateCustomerBillingQueries = ({
	queryClient,
	customerId,
}: {
	queryClient: QueryClient;
	customerId?: string;
}) => {
	if (customerId) {
		queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
	}
	queryClient.invalidateQueries({ queryKey: ["license_pools"] });
};
