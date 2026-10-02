import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { ShadowAtomConfigView } from "./shadowAtomTypes";

export const SHADOW_ATOM_CONFIG_QUERY_KEY = ["admin-shadow-atom-config"];

/** The shadow Atom config as staff see it: one for both envs, no token, encrypted or not. */
export const useShadowAtomConfig = () => {
	const axiosInstance = useAxiosInstance();
	return useQuery<ShadowAtomConfigView>({
		queryKey: SHADOW_ATOM_CONFIG_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/shadow-atom-config");
			return data;
		},
	});
};
