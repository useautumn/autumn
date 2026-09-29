import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { NO_ROLLOUT, type RolloutsResponse } from "./rolloutTypes";

const QUERY_KEY = ["admin-rollouts"];

/** Server state for the balance-worker rollout: the config as S3 holds it, plus the mutations that move it. */
export const useBalanceWorkerRollout = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const query = useQuery<RolloutsResponse>({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/rollouts");
			return data;
		},
	});

	const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	const rolloutId = query.data?.activeRolloutId;
	const rolloutPath = `/admin/rollouts/${rolloutId}`;

	const setGlobalPercent = useMutation({
		mutationFn: async ({ percent }: { percent: number }) => {
			await axiosInstance.put(rolloutPath, { percent });
		},
		onSuccess: () => {
			toast.success("Global percent scheduled");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update global percent")),
	});

	const setOrgPercent = useMutation({
		mutationFn: async ({
			orgId,
			percent,
		}: {
			orgId: string;
			percent: number;
		}) => {
			await axiosInstance.put(`${rolloutPath}/orgs/${orgId}`, { percent });
		},
		onSuccess: () => {
			toast.success("Org percent scheduled");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update org percent")),
	});

	const removeOrg = useMutation({
		mutationFn: async ({ orgId }: { orgId: string }) => {
			await axiosInstance.delete(`${rolloutPath}/orgs/${orgId}`);
		},
		onSuccess: () => {
			toast.success("Org override removed");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to remove org override")),
	});

	const entry = rolloutId ? query.data?.rollouts[rolloutId] : undefined;

	return {
		isLoading: query.isLoading,
		refresh,
		rolloutId,
		settleMs: query.data?.settleMs ?? 0,
		global: entry ?? NO_ROLLOUT,
		orgOverrides: Object.entries(entry?.orgs ?? {}),
		orgsById: query.data?.orgsById ?? {},
		health: query.data
			? {
					healthy: query.data.configHealthy,
					lastSuccessAt: query.data.lastSuccessAt,
				}
			: undefined,
		setGlobalPercent,
		setOrgPercent,
		removeOrg,
	};
};
