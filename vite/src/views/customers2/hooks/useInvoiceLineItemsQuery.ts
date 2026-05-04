import type { InvoiceLineItem } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type InvoiceTaxInfo = Record<string, { taxed_amount: number }>;

type InvoiceLineItemsResponse = {
	line_items: InvoiceLineItem[];
	tax_info?: InvoiceTaxInfo;
};

export const useInvoiceLineItemsQuery = ({
	customerId,
	invoiceIds,
	enabled = true,
}: {
	customerId: string | undefined;
	invoiceIds: string[];
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetcher = async (): Promise<InvoiceLineItemsResponse> => {
		if (invoiceIds.length === 0 || !customerId) {
			return { line_items: [] };
		}

		const { data } = await axiosInstance.post(
			`/customers/${customerId}/invoice-line-items`,
			{
				invoice_ids: invoiceIds,
			},
		);

		return data ?? { line_items: [] };
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["invoice-line-items", customerId, invoiceIds]),
		queryFn: fetcher,
		enabled: enabled && !!customerId && invoiceIds.length > 0,
		staleTime: 5 * 60 * 1000,
	});

	const lineItemsByInvoiceId = useMemo<
		Record<string, InvoiceLineItem[]>
	>(() => {
		if (!data) return {};

		return data.line_items.reduce<Record<string, InvoiceLineItem[]>>(
			(acc, lineItem) => {
				const invoiceId = lineItem.invoice_id;
				if (!invoiceId) return acc;
				if (!acc[invoiceId]) {
					acc[invoiceId] = [];
				}
				acc[invoiceId].push(lineItem);
				return acc;
			},
			{},
		);
	}, [data]);

	return {
		lineItems: data?.line_items || [],
		taxInfo: data?.tax_info ?? {},
		lineItemsByInvoiceId,
		isLoading,
		error,
		refetch,
	};
};
