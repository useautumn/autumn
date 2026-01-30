import type { FullCustomer } from "@autumn/shared";
import { useQueryClient } from "@tanstack/react-query";

export const useCachedCustomer = (customerId: string | undefined) => {
	const queryClient = useQueryClient();

	const getCachedCustomer = (): FullCustomer | null => {
		if (!customerId) return null;

		// Check all cached full customers queries
		const queryCache = queryClient.getQueryCache();
		const fullCustomersQueries = queryCache.findAll({
			queryKey: ["full_customers"],
		});

		// Sort by most recently updated first to get the freshest data
		const sortedQueries = fullCustomersQueries.sort((a, b) => {
			const aTime = a.state.dataUpdatedAt || 0;
			const bTime = b.state.dataUpdatedAt || 0;
			return bTime - aTime;
		});

		for (const query of sortedQueries) {
			// Only use data that's not stale and has been successfully fetched
			if (query.state.status === "success" && query.state.data) {
				const cachedData = query.state.data as
					| { fullCustomers: FullCustomer[] }
					| undefined;

				if (cachedData?.fullCustomers) {
					const cachedCustomer = cachedData.fullCustomers.find(
						(customer) =>
							customer.id === customerId || customer.internal_id === customerId,
					);

					if (cachedCustomer) {
						return cachedCustomer;
					}
				}
			}
		}

		return null;
	};

	return { getCachedCustomer };
};
