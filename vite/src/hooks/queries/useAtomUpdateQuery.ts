import type { GetAtomUpdateResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { atomIdBody, useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const POLL_INTERVAL_MS = 5_000;

/** The Atom deployment's latest alien update, polled while `isActive` (a grow still running). */
export const useAtomUpdateQuery = ({
	enabled,
	isActive,
}: {
	enabled: boolean;
	isActive: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const { basePath, queryKey, atomId } = useAtomApi();
	const { data } = useQuery({
		queryKey: [...queryKey, "update"],
		queryFn: async () => {
			const { data } = await axiosInstance.post<GetAtomUpdateResponse>(
				`${basePath}/byoc.get_atom_update`,
				atomIdBody({ atomId }),
			);
			return data;
		},
		enabled,
		retry: false,
		refetchInterval: isActive ? POLL_INTERVAL_MS : false,
	});
	return data?.update ?? null;
};
