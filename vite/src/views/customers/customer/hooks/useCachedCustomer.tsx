import { type FullCustomer, notNullish } from "@autumn/shared";
import { type Query, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";

const byNewestData = (a: Query, b: Query) =>
	(b.state.dataUpdatedAt || 0) - (a.state.dataUpdatedAt || 0);

export const useCachedCustomer = (customerId: string | undefined) => {
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const getCachedCustomer = (): FullCustomer | null => {
		if (!customerId) return null;

		// Check all cached full customers queries
		const queryCache = queryClient.getQueryCache();
		const fullCustomersQueries = queryCache.findAll({
			queryKey: ["full_customers"],
		});

		// Sort by most recently updated first to get the freshest data
		const sortedQueries = fullCustomersQueries.sort(byNewestData);

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

	const getLastFetchedCustomer = (): FullCustomer | null => {
		if (!customerId) return null;

		const scope = buildKey([]);
		const isInScope = (query: Query) =>
			scope.every(
				(part, index) => query.queryKey.at(index - scope.length) === part,
			);

		return (
			queryClient
				.getQueryCache()
				.findAll({ queryKey: ["customer", customerId] })
				.filter(isInScope)
				.sort(byNewestData)
				.map(
					(query) =>
						(query.state.data as { customer?: FullCustomer } | undefined)
							?.customer,
				)
				.find(notNullish) ?? null
		);
	};

	return { getCachedCustomer, getLastFetchedCustomer };
};
