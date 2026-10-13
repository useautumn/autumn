import type { InvoicePaymentMethod } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type DefaultPaymentMethodConfiguration = {
	id: string;
	payment_method_types: string[];
};

/** Invoice payment method types turned on in the connected Stripe account, and the default configuration Stripe falls back to; null when unknown. */
export const useStripePaymentMethodTypesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["stripe-payment-method-types"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{
				payment_method_types: InvoicePaymentMethod[] | null;
				default_configuration: DefaultPaymentMethodConfiguration | null;
			}>("/organization/stripe/payment_method_types");
			return data;
		},
		staleTime: 5 * 60 * 1000,
	});

	return {
		availableTypes: data?.payment_method_types ?? null,
		defaultConfiguration: data?.default_configuration ?? null,
		isLoading,
	};
};
