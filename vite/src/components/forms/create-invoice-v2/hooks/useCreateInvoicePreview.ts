import type {
	CreateInvoiceParams,
	CreateInvoicePreviewLine,
	CreateInvoiceResponse,
} from "@autumn/shared";
import { useMemo } from "react";
import { useBillingPreview } from "@/components/forms/shared/hooks/useBillingPreview";

const CREATE_INVOICE_PATH = "/v1/invoices.create";

const NO_EXPAND: readonly string[] = [];

const toLineItem = ({ line }: { line: CreateInvoicePreviewLine }) => ({
	object: "billing_preview_line_item" as const,
	custom: line.plan_id === null,
	display_name: line.description,
	description: line.description,
	subtotal: line.amount,
	total: line.amount_after_discounts,
	discounts: [],
	plan_id: line.plan_id ?? "",
	feature_id: line.feature_id,
	quantity: line.quantity ?? 0,
	...(line.period_start !== null && line.period_end !== null
		? { period: { start: line.period_start, end: line.period_end } }
		: {}),
});

/** Adapts the response's `lines` to the `line_items` shape PreviewSection renders. */
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

	const data = useMemo(() => {
		const preview = query.data?.preview;
		if (!preview) return null;

		const { tax, ...rest } = preview;
		return {
			...rest,
			line_items: preview.lines.map((line) => toLineItem({ line })),
			...(tax ? { tax: { total: tax.total, status: tax.status } } : {}),
		};
	}, [query.data]);

	return { ...query, data };
}

export type UseCreateInvoicePreviewReturn = ReturnType<
	typeof useCreateInvoicePreview
>;
