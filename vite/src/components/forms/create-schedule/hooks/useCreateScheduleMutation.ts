import type { CreateScheduleResponse, SetPlansParamsV0 } from "@autumn/shared";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";
import type { SendInvoiceSubmitParams } from "@/components/forms/shared/SendInvoiceStage";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";

export function useCreateScheduleMutation({
	customerId,
	buildRequestBody,
	getEnablePlanImmediately,
	onApplied,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	getEnablePlanImmediately?: () => boolean;
	onApplied?: () => void;
	buildRequestBody: (params?: BillingStageParams) => SetPlansParamsV0 | null;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const mutation = useBillingMutation<SetPlansParamsV0, CreateScheduleResponse>(
		{
			customerId,
			path: BILLING_OPERATIONS.setPlans.path,
			buildRequestBody,
			successMessage: "Plans set successfully",
			errorMessage: "Failed to set plans",
			onApplied,
			onCheckoutRedirect,
			onSuccess,
		},
	);

	const handleSubmit = () => {
		mutation.mutate({});
	};

	const handleInvoiceSubmit = async (params: SendInvoiceSubmitParams) => {
		const result = await mutation.mutateAsync({ ...params, useInvoice: true });
		return {
			stripeId: result.data?.invoice?.stripe_id,
			hostedInvoiceUrl: result.data?.invoice?.hosted_invoice_url,
		};
	};

	// The checkout stage owns the URL, so suppress the provider's copy-and-toast.
	const handleCheckoutSubmit = async () => {
		const result = await mutation.mutateAsync({
			skipDefaultSuccess: true,
			enableProductImmediately: getEnablePlanImmediately?.() || undefined,
		});
		return { paymentUrl: result.data?.payment_url };
	};

	return {
		handleSubmit,
		handleInvoiceSubmit,
		handleCheckoutSubmit,
		isPending: mutation.isPending,
	};
}
