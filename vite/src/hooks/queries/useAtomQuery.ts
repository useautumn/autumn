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

export const useAtomQueryKey = () => {
	const buildKey = useQueryKeyFactory();
	return buildKey(["atom"]);
};

/** The env's BYOC cache, polled while it waits on setup or provisions. */
export const useAtomQuery = ({ enabled = true } = {}) => {
	const axiosInstance = useAxiosInstance();
	const queryKey = useAtomQueryKey();

	const { data, isLoading, error, refetch } = useQuery<GetByocCacheResponse>({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetByocCacheResponse>(
				"/v1/byoc.get_atom",
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
