import {
	type ApiByocCache,
	ByocCacheStageStatus,
	ByocCacheStatus,
	type GetByocCacheResponse,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const POLL_INTERVAL_MS = 2000;
/** The org deletes its stack in AWS on its own time, so that wait is polled gently. */
const TEARDOWN_POLL_INTERVAL_MS = 10_000;

const SETTLING_STATUSES: ByocCacheStatus[] = [
	ByocCacheStatus.AwaitingSetup,
	ByocCacheStatus.Provisioning,
	ByocCacheStatus.Removing,
];

const pollIntervalFor = (cache: ApiByocCache | null | undefined) => {
	if (!cache) return false;
	if (cache.status === ByocCacheStatus.TeardownRequired)
		return TEARDOWN_POLL_INTERVAL_MS;
	const isConnecting =
		cache.status === ByocCacheStatus.Ready &&
		cache.stages.connected !== ByocCacheStageStatus.Done;
	const isSettling = SETTLING_STATUSES.includes(cache.status) || isConnecting;
	return isSettling ? POLL_INTERVAL_MS : false;
};

/** The env's Atom and earlier ones still coming down, polled until each is connected, failed, or gone. */
export const useAtomQuery = ({ enabled = true } = {}) => {
	const axiosInstance = useAxiosInstance();
	const { basePath, queryKey } = useAtomApi();

	const { data, dataUpdatedAt, isLoading, error, refetch } = useQuery({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetByocCacheResponse>(
				`${basePath}/byoc.get_atom`,
				{},
			);
			return data;
		},
		enabled,
		retry: false,
		refetchInterval: (query) => {
			const { cache, removing = [] } = query.state.data ?? {};
			const intervals = [cache, ...removing]
				.map(pollIntervalFor)
				.filter((interval) => interval !== false);
			return intervals.length ? Math.min(...intervals) : false;
		},
	});

	return {
		cache: data?.cache ?? null,
		removing: data?.removing ?? [],
		stackName: data?.stack_name ?? "",
		stackNameSuffix: data?.stack_name_suffix ?? "",
		/** When the Atom's status was last read, ms since epoch. */
		checkedAt: dataUpdatedAt,
		isLoading,
		error,
		refetch,
	};
};
