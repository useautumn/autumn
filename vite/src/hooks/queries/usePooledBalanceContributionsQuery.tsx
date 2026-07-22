import type {
	ApiPooledBalanceContributionV0,
	PagePaginatedResponse,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const CONTRIBUTIONS_PAGE_SIZE = 10;

const EMPTY_CONTRIBUTIONS: ApiPooledBalanceContributionV0[] = [];

type ContributionsPage =
	PagePaginatedResponse<ApiPooledBalanceContributionV0> & {
		total_count: number;
		total_filtered_count: number;
	};

/** One page of a pool's contributions, labelled by source entity and plan.
 * Search and paging happen server-side — pools can hold ~1M contributions. */
export const usePooledBalanceContributionsQuery = ({
	pooledBalanceId,
	page,
	search,
}: {
	pooledBalanceId?: string;
	page: number;
	search: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const offset = page * CONTRIBUTIONS_PAGE_SIZE;
	const trimmedSearch = search.trim();

	const { data, isLoading } = useQuery<ContributionsPage>({
		queryKey: buildKey([
			"pooled_balance_contributions",
			pooledBalanceId ?? null,
			offset,
			trimmedSearch,
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/v1/pooled_balances.list_contributions",
				{
					pooled_balance_id: pooledBalanceId,
					offset,
					limit: CONTRIBUTIONS_PAGE_SIZE,
					search: trimmedSearch || undefined,
				},
			);
			return data;
		},
		enabled: Boolean(pooledBalanceId),
		placeholderData: keepPreviousData,
	});

	return {
		contributions: data?.list ?? EMPTY_CONTRIBUTIONS,
		totalCount: data?.total_count ?? 0,
		totalFilteredCount: data?.total_filtered_count ?? 0,
		isLoading,
	};
};
