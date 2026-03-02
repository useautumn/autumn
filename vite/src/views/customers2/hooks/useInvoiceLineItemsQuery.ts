import type { InvoiceLineItem } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface UseInvoiceLineItemsQueryParams {
	invoiceIds: string[];
	enabled?: boolean;
}

interface LineItemsByInvoiceId {
	[invoiceId: string]: InvoiceLineItem[];
}

export const useInvoiceLineItemsQuery = ({
	invoiceIds,
	enabled = true,
}: UseInvoiceLineItemsQueryParams) => {
	const axiosInstance = useAxiosInstance();

	const fetcher = async (): Promise<InvoiceLineItem[]> => {
		if (invoiceIds.length === 0) {
			return [];
		}

		const { data } = await axiosInstance.post("/admin/invoice-line-items", {
			invoice_ids: invoiceIds,
		});

		return data.line_items ?? [];
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["invoice-line-items", invoiceIds],
		queryFn: fetcher,
		enabled: enabled && invoiceIds.length > 0,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	// Group line items by invoice_id for easy lookup
	const lineItemsByInvoiceId = useMemo<LineItemsByInvoiceId>(() => {
		if (!data) return {};

		return data.reduce<LineItemsByInvoiceId>((acc, lineItem) => {
			const invoiceId = lineItem.invoice_id;
			if (!acc[invoiceId]) {
				acc[invoiceId] = [];
			}
			acc[invoiceId].push(lineItem);
			return acc;
		}, {});
	}, [data]);

	return {
		lineItems: data ?? [],
		lineItemsByInvoiceId,
		isLoading,
		error,
		refetch,
	};
};
