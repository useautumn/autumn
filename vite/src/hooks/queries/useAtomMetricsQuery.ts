import type { AtomMetricsRange, GetAtomMetricsResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const REFETCH_INTERVAL_MS = 60_000;

/** The env's Atom's CPU, memory and traffic per period over the range, and its last minute, refreshed every minute. */
export const useAtomMetricsQuery = ({
	range,
	enabled = true,
}: {
	range: AtomMetricsRange;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const { basePath, queryKey } = useAtomApi();

	const { data, dataUpdatedAt, isLoading } = useQuery<GetAtomMetricsResponse>({
		queryKey: [...queryKey, "metrics", range],
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetAtomMetricsResponse>(
				`${basePath}/byoc.get_atom_metrics`,
				{ range },
			);
			return data;
		},
		enabled,
		refetchInterval: REFETCH_INTERVAL_MS,
	});

	return {
		periodSeconds: data?.period_seconds ?? 0,
		points: data?.points ?? [],
		latest: data?.latest ?? null,
		fetchedAt: dataUpdatedAt,
		isLoading: isLoading || !enabled,
	};
};
