import type { InvoicePaymentMethod } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Invoice payment method types turned on in the connected Stripe account; null when unknown. */
export const useStripePaymentMethodTypesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["stripe-payment-method-types"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{
				payment_method_types: InvoicePaymentMethod[] | null;
			}>("/organization/stripe/payment_method_types");
			return data.payment_method_types;
		},
		staleTime: 5 * 60 * 1000,
	});

	return { availableTypes: data ?? null, isLoading };
};
