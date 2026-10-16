import type { AtomMetricsRange, GetAtomMetricsResponse } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { atomIdBody, useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const REFETCH_INTERVAL_MS = 60_000;

/** The scoped Atom's CPU, memory, disk and traffic per period over the range, its last minute and its volumes, refreshed every minute. */
export const useAtomMetricsQuery = ({
	range,
	enabled = true,
}: {
	range: AtomMetricsRange;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const { basePath, queryKey, atomId } = useAtomApi();

	const { data, isLoading } = useQuery({
		queryKey: [...queryKey, "metrics", range],
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetAtomMetricsResponse>(
				`${basePath}/byoc.get_atom_metrics`,
				{ ...atomIdBody({ atomId }), range },
			);
			return { ...data, range, fetchedAt: Date.now() };
		},
		enabled,
		// A range switch keeps the current charts until the new range lands, rather than blinking to skeletons.
		placeholderData: keepPreviousData,
		refetchInterval: REFETCH_INTERVAL_MS,
	});

	return {
		/** The range and fetch time the data is for: the previous range's until a switched one lands. */
		range: data?.range ?? range,
		periodSeconds: data?.period_seconds ?? 0,
		points: data?.points ?? [],
		latest: data?.latest ?? null,
		volumes: data?.volumes ?? [],
		fetchedAt: data?.fetchedAt ?? 0,
		isLoading: isLoading || !enabled,
	};
};
