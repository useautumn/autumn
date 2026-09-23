import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type CustomerPaymentMethod = {
	id: string;
	type: string;
	brand: string | null;
	last4: string | null;
	exp_month: number | null;
	exp_year: number | null;
	is_default: boolean;
};

export const useCustomerPaymentMethodsQuery = ({
	customerId,
	enabled = true,
}: {
	customerId: string | undefined;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["customer-payment-methods", customerId]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{
				payment_methods: CustomerPaymentMethod[];
			}>(`/customers/${customerId}/payment_methods`);
			return data.payment_methods;
		},
		enabled: enabled && Boolean(customerId),
	});

	return { paymentMethods: data ?? [], isLoading };
};
