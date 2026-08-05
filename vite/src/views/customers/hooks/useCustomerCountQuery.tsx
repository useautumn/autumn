import type { CustomerListFilters } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useCustomerCountQuery = ({
	search,
	filters,
	enabled = true,
}: {
	search: string;
	filters: CustomerListFilters;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: buildKey([
			"customers-count",
			filters.status,
			filters.version,
			filters.none,
			filters.processor,
			filters.interval,
			search,
		]),
		enabled,
		queryFn: async () => {
			const { data } = await axiosInstance.post("/customers/all/count", {
				search,
				filters,
			});
			return data.totalCount as number;
		},
		placeholderData: keepPreviousData,
	});
};
