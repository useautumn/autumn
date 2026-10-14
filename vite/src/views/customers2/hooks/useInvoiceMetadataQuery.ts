import { ProcessorType } from "@autumn/shared";
import {
	type UseQueryResult,
	useQueries,
	useQuery,
} from "@tanstack/react-query";
import type { AxiosInstance } from "axios";
import { useCallback } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type InvoiceMetadata = Record<string, string>;

type InvoiceMetadataResponse = {
	metadata: InvoiceMetadata;
};

export type InvoiceProcessorVariant = ProcessorType | "vercel";

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

export const useInvoicesMetadataQuery = ({
	customerId,
	stripeInvoiceIds,
}: {
	customerId: string | undefined;
	stripeInvoiceIds: string[];
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const combineMetadataByStripeId = useCallback(
		(results: UseQueryResult<InvoiceMetadataResponse>[]) => {
			const metadataByStripeId: Record<string, InvoiceMetadata> = {};
			for (const [index, result] of results.entries()) {
				if (result.data)
					metadataByStripeId[stripeInvoiceIds[index]] = result.data.metadata;
			}
			return metadataByStripeId;
		},
		[stripeInvoiceIds],
	);

	const metadataByStripeId = useQueries({
		queries: stripeInvoiceIds.map((stripeInvoiceId) =>
			invoiceMetadataQueryOptions({
				axiosInstance,
				buildKey,
				customerId,
				stripeInvoiceId,
			}),
		),
		combine: combineMetadataByStripeId,
	});

	return { metadataByStripeId };
};
