import type {
	CreateInvoiceParams,
	CreateInvoiceResponse,
} from "@autumn/shared";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";

const CREATE_INVOICE_PATH = "/v1/invoices.create";

const NO_EXPAND: readonly string[] = [];

export function useCreateInvoicePreview({
	requestBody,
	enabled,
}: {
	requestBody: CreateInvoiceParams | null;
	enabled?: boolean;
}) {
	const query = useBillingPreview<CreateInvoiceParams, CreateInvoiceResponse>({
		path: CREATE_INVOICE_PATH,
		queryKeyPrefix: "create-invoice-preview",
		requestBody,
		enabled,
		expand: NO_EXPAND,
	});

	return { ...query, data: query.data?.preview ?? null };
}

export type UseCreateInvoicePreviewReturn = ReturnType<
	typeof useCreateInvoicePreview
>;
