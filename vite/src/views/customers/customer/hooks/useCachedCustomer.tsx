import type { FullCustomer } from "@autumn/shared";
import { useQueryClient } from "@tanstack/react-query";

export const useCachedCustomer = (customerId: string | undefined) => {
	const queryClient = useQueryClient();

	const getCachedCustomer = (): FullCustomer | null => {
		if (!customerId) return null;

		const queryCache = queryClient.getQueryCache();
		const fullCustomersQueries = queryCache.findAll({
			queryKey: ["full_customers"],
		});

		const sortedQueries = fullCustomersQueries.sort((a, b) => {
			const aTime = a.state.dataUpdatedAt || 0;
			const bTime = b.state.dataUpdatedAt || 0;
			return bTime - aTime;
		});

		for (const query of sortedQueries) {
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
