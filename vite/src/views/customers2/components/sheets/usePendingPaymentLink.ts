import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const usePendingPaymentLink = ({
	customerId,
	customerProductId,
	enabled,
}: {
	customerId?: string;
	customerProductId?: string;
	enabled: boolean;
}) => {
	const axiosInstance = useAxiosInstance();

	return useQuery({
		queryKey: ["pending-payment-link", customerId, customerProductId],
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/customers/${customerId}/products/${customerProductId}/payment_link`,
			);
			return (data?.url as string | null) ?? null;
		},
		enabled: enabled && !!customerId && !!customerProductId,
	});
};
