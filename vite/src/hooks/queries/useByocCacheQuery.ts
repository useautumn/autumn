import {
	type ByocCacheStatus,
	ByocCacheStatus as CacheStatus,
	type GetByocCacheResponse,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const POLL_INTERVAL_MS = 2000;

const isSettling = (status: ByocCacheStatus | undefined) =>
	status === CacheStatus.AwaitingSetup || status === CacheStatus.Provisioning;

export const useByocCacheQueryKey = () => {
	const buildKey = useQueryKeyFactory();
	return buildKey(["byoc-cache"]);
};

/** The env's BYOC cache, polled while it waits on setup or provisions. */
export const useByocCacheQuery = ({ enabled = true } = {}) => {
	const axiosInstance = useAxiosInstance();
	const queryKey = useByocCacheQueryKey();

	const { data, isLoading, error, refetch } = useQuery<GetByocCacheResponse>({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetByocCacheResponse>(
				"/v1/byoc.get_cache",
				{},
			);
			return data;
		},
		enabled,
		retry: false,
		refetchInterval: (query) =>
			isSettling(query.state.data?.cache?.status) ? POLL_INTERVAL_MS : false,
	});

	return { cache: data?.cache ?? null, isLoading, error, refetch };
};
