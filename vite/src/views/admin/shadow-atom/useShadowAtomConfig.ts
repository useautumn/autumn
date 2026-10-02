import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { toShadowAtomSettings } from "./shadowAtomRolloutEdits";
import type {
	ShadowAtomConfigView,
	ShadowAtomEnv,
	ShadowAtomRollout,
} from "./shadowAtomTypes";

export const SHADOW_ATOM_CONFIG_QUERY_KEY = ["admin-shadow-atom-config"];

/** The shadow Atom config as staff see it, and the one write that moves a rollout. */
export const useShadowAtomConfig = ({ env }: { env: ShadowAtomEnv }) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const query = useQuery<ShadowAtomConfigView>({
		queryKey: SHADOW_ATOM_CONFIG_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/shadow-atom-config");
			return data;
		},
	});

	const saveRollout = useMutation({
		mutationFn: async ({ rollout }: { rollout: ShadowAtomRollout }) => {
			if (!query.data) throw new Error("The config has not loaded yet");
			await axiosInstance.put(
				"/admin/shadow-atom-config",
				toShadowAtomSettings({ config: query.data, env, rollout }),
			);
		},
		onSuccess: () => {
			toast.success("Shadow Atom rollout saved");
			void queryClient.invalidateQueries({
				queryKey: SHADOW_ATOM_CONFIG_QUERY_KEY,
			});
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to save the rollout")),
	});

	return { query, envConfig: query.data?.[env], saveRollout };
};
