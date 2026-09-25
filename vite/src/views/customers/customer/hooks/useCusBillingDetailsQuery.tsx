import type { ApiBillingDetails } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Separate from the customer query so a Stripe failure only affects billing details. */
export const useCusBillingDetailsQuery = ({
	customerId,
	enabled,
}: {
	customerId?: string;
	enabled: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: buildKey(["customer_billing_details", customerId]),
		queryFn: async (): Promise<ApiBillingDetails | null> => {
			const { data } = await axiosInstance.get(
				`/v1/customers/${customerId}?expand=billing_details`,
			);
			return data.billing_details ?? null;
		},
		enabled: enabled && !!customerId,
		retry: false,
	});
};
