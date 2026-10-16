import type { ListAtomChecksResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { atomIdBody, useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const POLL_INTERVAL_MS = 3000;

const hasChecks = (data: ListAtomChecksResponse | undefined) =>
	(data?.checks.length ?? 0) > 0;

/** The Atom's latest checks, polled until the first arrive, then held as they first came in. */
export const useAtomChecksQuery = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();
	const { basePath, queryKey, atomId } = useAtomApi();

	const { data } = useQuery<ListAtomChecksResponse>({
		queryKey: [...queryKey, "checks"],
		queryFn: async () => {
			const { data } = await axiosInstance.post<ListAtomChecksResponse>(
				`${basePath}/byoc.list_atom_checks`,
				atomIdBody({ atomId }),
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
