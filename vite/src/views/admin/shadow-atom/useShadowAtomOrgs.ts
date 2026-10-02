import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { SHADOW_ATOM_CONFIG_QUERY_KEY } from "./useShadowAtomConfig";

/** Add, re-percent and remove orgs on the shadow Atom, both envs at once; an add's token lives only in its mutation result. */
export const useShadowAtomOrgs = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const orgPath = (orgId: string) =>
		`/admin/shadow-atom-config/orgs/${encodeURIComponent(orgId)}`;
	// Each write stays pending until fresh config lands, so the table never shows a stale percent.
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: SHADOW_ATOM_CONFIG_QUERY_KEY });
	const onError = (fallback: string) => (error: unknown) =>
		toast.error(getBackendErr(error, fallback));

	const add = useMutation({
		mutationFn: async ({
			orgId,
			percent,
		}: {
			orgId: string;
			percent: number;
		}) => {
			const { data } = await axiosInstance.put(orgPath(orgId), { percent });
			return {
				orgId: data.org_id as string,
				tokens: data.tokens as Record<"sandbox" | "live", string>,
			};
		},
		onSuccess: refresh,
		onError: onError("Failed to add the org"),
	});

	const setPercent = useMutation({
		mutationFn: async ({
			orgId,
			percent,
		}: {
			orgId: string;
			percent: number;
		}) => {
			await axiosInstance.patch(orgPath(orgId), { percent });
		},
		onSuccess: refresh,
		onError: onError("Failed to set the percent"),
	});

	const remove = useMutation({
		mutationFn: async ({ orgId }: { orgId: string }) => {
			await axiosInstance.delete(orgPath(orgId));
		},
		onSuccess: () => {
			add.reset();
			return refresh();
		},
		onError: onError("Failed to remove the org"),
	});

	return {
		add,
		setPercent,
		remove,
		isBusy: add.isPending || setPercent.isPending || remove.isPending,
	};
};
