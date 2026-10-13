import type { ListAtomChecksResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const POLL_INTERVAL_MS = 3000;

const hasChecks = (data: ListAtomChecksResponse | undefined) =>
	(data?.checks.length ?? 0) > 0;

/** The Atom's latest checks, polled until the first arrive, then held as they first came in. */
export const useAtomChecksQuery = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data } = useQuery<ListAtomChecksResponse>({
		queryKey: buildKey(["atom", "checks"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post<ListAtomChecksResponse>(
				"/v1/byoc.list_atom_checks",
				{},
			);
			return data;
		},
		enabled,
		retry: false,
		staleTime: (query) => (hasChecks(query.state.data) ? Infinity : 0),
		refetchInterval: (query) =>
			hasChecks(query.state.data) ? false : POLL_INTERVAL_MS,
	});

	return { checks: data?.checks ?? [] };
};
