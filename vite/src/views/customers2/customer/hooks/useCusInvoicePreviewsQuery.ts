import { type ApiInvoicePreviewV0, LATEST_VERSION } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const INVOICE_PREVIEWS_STALE_TIME = 5 * 60 * 1000;

export function useCusInvoicePreviewsQuery({
	customerId,
	enabled,
}: {
	customerId?: string;
	enabled: boolean;
}) {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["customer-invoice-previews", customerId]),
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/v1/customers/${customerId}?expand=invoice_previews`,
			);
			return (data?.invoice_previews ?? null) as ApiInvoicePreviewV0[] | null;
		},
		enabled: enabled && !!customerId,
		staleTime: INVOICE_PREVIEWS_STALE_TIME,
	});

	return { invoicePreviews: data, isLoading, error, refetch };
}
