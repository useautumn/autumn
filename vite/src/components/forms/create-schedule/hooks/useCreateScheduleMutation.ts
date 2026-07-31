import type {
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";
import type { BillingStageParams } from "@/components/forms/shared/utils/billingStageParams";

export function useCreateScheduleMutation({
	customerId,
	buildRequestBody,
	onCheckoutRedirect,
	onSuccess,
}: {
	customerId: string | undefined;
	buildRequestBody: (
		params?: BillingStageParams,
	) => CreateScheduleParamsV0 | null;
	onCheckoutRedirect?: (checkoutUrl: string) => void;
	onSuccess?: () => void;
}) {
	const mutation = useBillingMutation<
		CreateScheduleParamsV0,
		CreateScheduleResponse
	>({
		customerId,
		path: BILLING_OPERATIONS.createSchedule.path,
		buildRequestBody,
		invalidatesSchedule: BILLING_OPERATIONS.createSchedule.invalidatesSchedule,
		successMessage: "Schedule created successfully",
		errorMessage: "Failed to create schedule",
		onCheckoutRedirect,
		onSuccess,
	});

	const handleSubmit = () => {
		mutation.mutate({});
	};

	const handleInvoiceSubmit = async ({
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
		handleSubmit,
		handleInvoiceSubmit,
		isPending: mutation.isPending,
	};
}
