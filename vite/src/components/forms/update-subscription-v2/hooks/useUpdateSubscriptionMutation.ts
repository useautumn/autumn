import type {
	BillingResponse,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function useUpdateSubscriptionMutation({
	updateSubscriptionFormContext,
	buildRequestBody,
	onCheckoutRedirect,
	onSuccess,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	buildRequestBody: (
		params?: BillingStageParams,
	) => UpdateSubscriptionV0Params | null;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const { customerId } = updateSubscriptionFormContext;

	const mutation = useBillingMutation<
		UpdateSubscriptionV0Params,
		BillingResponse
	>({
		customerId,
		path: BILLING_OPERATIONS.updateSubscription.path,
		buildRequestBody,
		successMessage: "Subscription updated successfully",
		errorMessage: "Failed to update subscription",
		onCheckoutRedirect,
		onSuccess,
	});

	const handleConfirm = () => {
		mutation.mutate({ useInvoice: false });
	};

	const handleInvoiceUpdate = async ({
		enableProductImmediately,
		finalizeInvoice,
		invoiceTemplateId,
		netTermsDays,
	}: {
		enableProductImmediately: boolean;
		finalizeInvoice: boolean;
		invoiceTemplateId?: string;
		netTermsDays?: number;
	}) => {
		const result = await mutation.mutateAsync({
			useInvoice: true,
			enableProductImmediately,
			finalizeInvoice,
			invoiceTemplateId,
			netTermsDays,
		});
		return {
			stripeId: result.data?.invoice?.stripe_id,
			hostedInvoiceUrl: result.data?.invoice?.hosted_invoice_url,
		};
	};

	return {
		mutation,
		handleConfirm,
		handleInvoiceUpdate,
		isPending: mutation.isPending,
	};
}
