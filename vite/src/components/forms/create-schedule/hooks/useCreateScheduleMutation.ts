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
	buildRequestBody: (params?: {
		useInvoice?: boolean;
		enableProductImmediately?: boolean;
		finalizeInvoice?: boolean;
	}) => CreateScheduleParamsV0 | null;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async ({
			useInvoice,
			enableProductImmediately,
			finalizeInvoice,
		}: {
			useInvoice?: boolean;
			enableProductImmediately?: boolean;
			finalizeInvoice?: boolean;
		}) => {
			if (!customerId) throw new Error("Customer ID is required");

			const requestBody = buildRequestBody({
				useInvoice,
				enableProductImmediately,
				finalizeInvoice,
			});
			if (!requestBody) throw new Error("Failed to build request body");

			const response = await axiosInstance.post<CreateScheduleResponse>(
				"/v1/billing.create_schedule",
				requestBody,
			);

			return { data: response.data, useInvoice };
		},
		onSuccess: ({ data, useInvoice }) => {
			if (useInvoice) {
				if (data?.invoice) {
					toast.success("Invoice created successfully");
				}
			} else if (data?.payment_url) {
				onCheckoutRedirect?.(data.payment_url);
			} else {
				toast.success("Schedule created successfully");
			}

			if (!useInvoice) {
				onSuccess?.();
			}

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

	const handleSubmit = () => {
		mutation.mutate({});
	};

	const handleInvoiceSubmit = async ({
		enableProductImmediately,
		finalizeInvoice,
	}: {
		enableProductImmediately: boolean;
		finalizeInvoice: boolean;
	}) => {
		const result = await mutation.mutateAsync({
			useInvoice: true,
			enableProductImmediately,
			finalizeInvoice,
		});
		return {
			stripeId: result.data?.invoice?.stripe_id,
			hostedInvoiceUrl: result.data?.invoice?.hosted_invoice_url,
		};
	};

	return {
		mutation,
		handleSubmit,
		handleInvoiceSubmit,
		isPending: mutation.isPending,
	};
}
