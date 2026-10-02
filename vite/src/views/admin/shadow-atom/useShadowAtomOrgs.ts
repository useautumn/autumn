import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import type { ShadowAtomEnv } from "./shadowAtomTypes";
import { SHADOW_ATOM_CONFIG_QUERY_KEY } from "./useShadowAtomConfig";

/** Register / unregister an org on the env's shadow Atom; a register's token lives only in its mutation result. */
export const useShadowAtomOrgs = ({ env }: { env: ShadowAtomEnv }) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const orgPath = (orgId: string) =>
		`/admin/shadow-atom-config/${env}/orgs/${encodeURIComponent(orgId)}`;
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: SHADOW_ATOM_CONFIG_QUERY_KEY });

	const register = useMutation({
		mutationFn: async ({ orgId }: { orgId: string }) => {
			const { data } = await axiosInstance.put(orgPath(orgId));
			return { orgId: data.org_id as string, token: data.token as string };
		},
		onSuccess: () => void refresh(),
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to register the org")),
	});

	const unregister = useMutation({
		mutationFn: async ({ orgId }: { orgId: string }) => {
			await axiosInstance.delete(orgPath(orgId));
		},
		onSuccess: () => {
			register.reset();
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to unregister the org")),
	});

	return {
		register,
		unregister,
		isBusy: register.isPending || unregister.isPending,
	};
};
