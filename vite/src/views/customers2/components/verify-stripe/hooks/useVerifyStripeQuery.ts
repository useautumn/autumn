import type { VerifyResponse } from "@autumn/shared";
import { ProcessorType } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

const VERIFY_STALE_TIME_MS = 30_000;

export const useVerifyStripeQuery = () => {
	const { customer } = useCusQuery();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const customerId = customer?.id ?? customer?.internal_id ?? "";
	const hasStripeCustomer =
		Boolean(customer?.processor?.id) &&
		customer?.processor?.type === ProcessorType.Stripe;

	const query = useQuery({
		queryKey: buildKey(["verify-stripe", customerId]),
		queryFn: async (): Promise<VerifyResponse> => {
			const { data } = await axiosInstance.post("/v1/billing.verify", {
				customer_id: customerId,
			});
			return data;
		},
		enabled: Boolean(customerId) && hasStripeCustomer,
		staleTime: VERIFY_STALE_TIME_MS,
	});

	const subscriptions = query.data?.subscriptions ?? [];
	const customerMismatches = query.data?.customer_mismatches ?? [];
	const mismatchCount =
		customerMismatches.length +
		subscriptions.reduce(
			(count, subscription) => count + subscription.mismatches.length,
			0,
		);
	const hasErrorMismatch =
		customerMismatches.some((mismatch) => mismatch.severity !== "warning") ||
		subscriptions.some((subscription) =>
			subscription.mismatches.some(
				(mismatch) => mismatch.severity !== "warning",
			),
		);

	return {
		subscriptions,
		customerMismatches,
		mismatchCount,
		hasErrorMismatch,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
		isRefetching: query.isRefetching,
	};
};
