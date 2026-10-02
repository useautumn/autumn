import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type {
	ShadowAtomEnv,
	ShadowAtomResultRange,
	ShadowAtomResults,
} from "./shadowAtomTypes";

export const useShadowAtomResults = ({
	env,
	range,
}: {
	env: ShadowAtomEnv;
	range: ShadowAtomResultRange;
}) => {
	const axiosInstance = useAxiosInstance();
	return useQuery<ShadowAtomResults>({
		queryKey: ["admin-shadow-atom-results", env, range],
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/admin/shadow-atom-config/${env}/results`,
				{ params: { range } },
			);
			return data;
		},
		staleTime: 30_000,
	});
};
