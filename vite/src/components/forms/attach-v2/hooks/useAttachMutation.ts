import type {
	AttachParamsV0,
	BillingResponse,
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";

export function useAttachMutation({
	customerId,
	buildRequestBody,
	path,
	invalidatesSchedule,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	buildRequestBody: (
		params?: BillingStageParams,
	) => AttachParamsV0 | CreateScheduleParamsV0 | null;
	path: string;
	invalidatesSchedule: boolean;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const mutation = useBillingMutation<
		AttachParamsV0 | CreateScheduleParamsV0,
		BillingResponse | CreateScheduleResponse
	>({
		customerId,
		path,
		buildRequestBody,
		invalidatesSchedule,
		successMessage: "Product attached successfully",
		errorMessage: "Failed to attach product",
		onCheckoutRedirect,
		onSuccess,
	});

	const handleConfirm = ({
		enableProductImmediately,
	}: {
		enableProductImmediately?: boolean;
	} = {}) => {
		mutation.mutate({ useInvoice: false, enableProductImmediately });
	};

	const handleInvoiceAttach = async (
		params: BillingStageParams & {
			enableProductImmediately: boolean;
			finalizeInvoice?: boolean;
		},
	) => {
		const result = await mutation.mutateAsync({ ...params, useInvoice: true });
		return {
			stripeId: result.data?.invoice?.stripe_id,
			hostedInvoiceUrl: result.data?.invoice?.hosted_invoice_url,
		};
	};

	const handleCheckoutAttach = async ({
		longLivedCheckout,
	}: {
		longLivedCheckout?: boolean;
	} = {}) => {
		const result = await mutation.mutateAsync({
			useInvoice: false,
			longLivedCheckout,
			skipDefaultSuccess: true,
		});
		return { paymentUrl: result.data?.payment_url };
	};

	return {
		mutation,
		handleConfirm,
		handleInvoiceAttach,
		handleCheckoutAttach,
		isPending: mutation.isPending,
	};
}
