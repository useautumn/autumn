import type {
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export function useCreateScheduleMutation({
	customerId,
	buildRequestBody,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	buildRequestBody: () => CreateScheduleParamsV0 | null;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async () => {
			if (!customerId) throw new Error("Customer ID is required");

			const requestBody = buildRequestBody();
			if (!requestBody) throw new Error("Failed to build request body");

			const response = await axiosInstance.post<CreateScheduleResponse>(
				"/v1/billing.create_schedule",
				requestBody,
			);

			return response.data;
		},
		onSuccess: (data) => {
			if (data?.payment_url) {
				onCheckoutRedirect?.(data.payment_url);
			} else {
				toast.success("Schedule created successfully");
			}

			onSuccess?.();

			if (customerId) {
				queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
			}
		},
		onError: (error) => {
			toast.error(
				(error as AxiosError<{ message: string }>)?.response?.data?.message ??
					"Failed to create schedule",
			);
		},
	});

	return {
		mutation,
		handleSubmit: () => mutation.mutate(),
		isPending: mutation.isPending,
	};
}
