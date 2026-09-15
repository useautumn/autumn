import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type InvoiceMetadataResponse = {
	metadata: Record<string, string>;
};

/** Stripe invoice metadata for one invoice; only fetched while the sheet is open. */
export const useInvoiceMetadataQuery = ({
	customerId,
	stripeInvoiceId,
	enabled = true,
}: {
	customerId: string | undefined;
	stripeInvoiceId: string | undefined;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["invoice-metadata", customerId, stripeInvoiceId]),
		queryFn: async (): Promise<InvoiceMetadataResponse> => {
			const { data } = await axiosInstance.get(
				`/customers/${customerId}/invoices/${stripeInvoiceId}/metadata`,
			);
			return data ?? { metadata: {} };
		},
		enabled: enabled && !!customerId && !!stripeInvoiceId,
		staleTime: 5 * 60 * 1000,
	});

	return { metadata: data?.metadata ?? {}, isLoading };
};
