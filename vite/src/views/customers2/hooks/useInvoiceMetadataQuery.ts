import { ProcessorType } from "@autumn/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { AxiosInstance } from "axios";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type InvoiceMetadata = Record<string, string>;

type InvoiceMetadataResponse = {
	metadata: InvoiceMetadata;
};

export type InvoiceProcessorVariant = ProcessorType | "vercel";

/** Vercel invoices are Stripe-ledgered; only the metadata says they're Vercel. */
export const resolveInvoiceProcessor = ({
	processorType,
	metadata,
}: {
	processorType: ProcessorType | null | undefined;
	metadata: InvoiceMetadata | undefined;
}): InvoiceProcessorVariant =>
	metadata?.vercel_installation_id
		? "vercel"
		: (processorType ?? ProcessorType.Stripe);

const invoiceMetadataQueryOptions = ({
	axiosInstance,
	buildKey,
	customerId,
	stripeInvoiceId,
	enabled = true,
}: {
	axiosInstance: AxiosInstance;
	buildKey: ReturnType<typeof useQueryKeyFactory>;
	customerId: string | undefined;
	stripeInvoiceId: string | undefined;
	enabled?: boolean;
}) => ({
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

	const { data, isLoading, isError } = useQuery(
		invoiceMetadataQueryOptions({
			axiosInstance,
			buildKey,
			customerId,
			stripeInvoiceId,
			enabled,
		}),
	);

	return { metadata: data?.metadata ?? {}, isLoading, isError };
};

/** Metadata for every invoice on the page, keyed by Stripe invoice id. */
export const useInvoicesMetadataQuery = ({
	customerId,
	stripeInvoiceIds,
}: {
	customerId: string | undefined;
	stripeInvoiceIds: string[];
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const results = useQueries({
		queries: stripeInvoiceIds.map((stripeInvoiceId) =>
			invoiceMetadataQueryOptions({
				axiosInstance,
				buildKey,
				customerId,
				stripeInvoiceId,
			}),
		),
	});

	const metadataByStripeId: Record<string, InvoiceMetadata> = {};
	results.forEach((result, i) => {
		if (result.data)
			metadataByStripeId[stripeInvoiceIds[i]] = result.data.metadata;
	});

	return { metadataByStripeId };
};
