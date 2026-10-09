import type { AtomMetricsRange, GetAtomMetricsResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const REFETCH_INTERVAL_MS = 60_000;

/** The env's Atom's CPU, memory and traffic over the range, refreshed every minute. */
export const useAtomMetricsQuery = ({ range }: { range: AtomMetricsRange }) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, dataUpdatedAt, isLoading } = useQuery<GetAtomMetricsResponse>({
		queryKey: buildKey(["atom-metrics", range]),
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetAtomMetricsResponse>(
				"/v1/byoc.get_atom_metrics",
				{ range },
			);
			return data;
		},
		refetchInterval: REFETCH_INTERVAL_MS,
	});

	return {
		bucketSeconds: data?.bucket_seconds ?? 0,
		points: data?.points ?? [],
		fetchedAt: dataUpdatedAt,
		isLoading,
	};
};
