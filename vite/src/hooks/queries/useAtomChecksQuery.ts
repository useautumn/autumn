import type { ListAtomChecksResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { atomIdBody, useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const POLL_INTERVAL_MS = 3000;

const hasSeenCheck = (data: ListAtomChecksResponse | undefined) =>
	Boolean(data?.first_check_seen_at);

/** Polled until the Atom has seen the org's first check, then held with the checks it came with. */
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
		staleTime: (query) => (hasSeenCheck(query.state.data) ? Infinity : 0),
		refetchInterval: (query) =>
			hasSeenCheck(query.state.data) ? false : POLL_INTERVAL_MS,
	});

	return {
		firstCheckSeenAt: data?.first_check_seen_at ?? null,
		checks: data?.checks ?? [],
	};
};
