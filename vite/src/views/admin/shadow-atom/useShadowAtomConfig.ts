import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { ShadowAtomConfigView, ShadowAtomEnv } from "./shadowAtomTypes";

export const SHADOW_ATOM_CONFIG_QUERY_KEY = ["admin-shadow-atom-config"];

/** The shadow Atom config as staff see it: no token, encrypted or not. */
export const useShadowAtomConfig = ({ env }: { env: ShadowAtomEnv }) => {
	const axiosInstance = useAxiosInstance();
	const query = useQuery<ShadowAtomConfigView>({
		queryKey: SHADOW_ATOM_CONFIG_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/shadow-atom-config");
			return data;
		},
	});
	return { query, envConfig: query.data?.[env] };
};
