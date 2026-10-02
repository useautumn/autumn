import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { NO_SHADOW_ATOM_NAMES } from "./shadowAtomNames";
import type { ShadowAtomEnv, ShadowAtomNames } from "./shadowAtomTypes";
import { SHADOW_ATOM_CONFIG_QUERY_KEY } from "./useShadowAtomConfig";

/** Keyed under the config, so every config refresh refetches the names too. */
export const useShadowAtomNames = ({
	env,
}: {
	env: ShadowAtomEnv;
}): ShadowAtomNames => {
	const axiosInstance = useAxiosInstance();
	const query = useQuery<ShadowAtomNames>({
		queryKey: [...SHADOW_ATOM_CONFIG_QUERY_KEY, "names", env],
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/admin/shadow-atom-config/${env}/names`,
			);
			return data;
		},
	});
	return query.data ?? NO_SHADOW_ATOM_NAMES;
};
