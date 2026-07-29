import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export type RCWebhookStatus = "registered" | "not_registered" | "unknown";

interface RCWebhookResponse {
	status: RCWebhookStatus;
	url: string | null;
	secret: string | null;
}

export const useRCWebhook = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	const queryKey = buildKey(["revenuecat-webhook"]);

	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.get<RCWebhookResponse>(
				"/v1/organization/revenuecat/webhook",
			);
			return data;
		},
	});

	const registerMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post<RCWebhookResponse>(
				"/v1/organization/revenuecat/webhook",
			);
			return data;
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey });
			if (result.status === "registered") {
				toast.success("Webhook registered with RevenueCat");
			} else {
				toast.warning(
					"Couldn't register automatically — set it up manually below",
				);
			}
		},
		onError: (error) => {
			toast.error(
				getBackendErr(
					error,
					"Couldn't register automatically — set it up manually below",
				),
			);
		},
	});

	return {
		status: data?.status ?? "unknown",
		url: data?.url ?? null,
		secret: data?.secret ?? null,
		isLoading,
		register: registerMutation.mutateAsync,
		isRegistering: registerMutation.isPending,
	};
};
