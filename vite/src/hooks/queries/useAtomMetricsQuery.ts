import type { AtomMetricsRange, GetAtomMetricsResponse } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const REFETCH_INTERVAL_MS = 60_000;

export const useAtomMetricsQuery = ({
	range,
	enabled = true,
}: {
	range: AtomMetricsRange;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const { basePath, queryKey } = useAtomApi();

	const { data, isLoading } = useQuery({
		queryKey: [...queryKey, "metrics", range],
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetAtomMetricsResponse>(
				`${basePath}/byoc.get_atom_metrics`,
				{ range },
			);
			return { ...data, range, fetchedAt: Date.now() };
		},
		enabled,
		placeholderData: keepPreviousData,
		refetchInterval: REFETCH_INTERVAL_MS,
	});

	return {
		range: data?.range ?? range,
		periodSeconds: data?.period_seconds ?? 0,
		points: data?.points ?? [],
		latest: data?.latest ?? null,
		fetchedAt: data?.fetchedAt ?? 0,
		isLoading: isLoading || !enabled,
	};
};
