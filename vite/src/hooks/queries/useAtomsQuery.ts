import type { ListByocAtomsResponse } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAtomApi } from "@/contexts/AtomApiContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { atomPollInterval } from "./useAtomQuery";

/** The env's Atoms and earlier ones still coming down, polled while any of them is still moving. */
export const useAtomsQuery = () => {
	const axiosInstance = useAxiosInstance();
	const { basePath, queryKey } = useAtomApi();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: [...queryKey, "list"],
		queryFn: async () => {
			const { data } = await axiosInstance.post<ListByocAtomsResponse>(
				`${basePath}/byoc.list_atoms`,
				{},
			);
			return data;
		},
		retry: false,
		refetchInterval: (query) => {
			const { atoms = [], removing = [] } = query.state.data ?? {};
			const intervals = [...atoms, ...removing]
				.map(atomPollInterval)
				.filter((interval) => interval !== false);
			return intervals.length ? Math.min(...intervals) : false;
		},
	});

	return {
		atoms: data?.atoms ?? [],
		removing: data?.removing ?? [],
		nextStackName: data?.next_stack_name ?? "",
		nextStackNameSuffix: data?.next_stack_name_suffix ?? "",
		limits: data?.limits ?? null,
		isLoading,
		error,
		refetch,
	};
};
