import {
	type FullCustomer,
	filterCustomerProductsByActiveStatuses,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const hasNoBillingCycle = ({ customer }: { customer: FullCustomer }) =>
	filterCustomerProductsByActiveStatuses({
		customerProducts: customer.customer_products,
	}).every(({ product }) => product.is_default);

export const useAnalyticsCustomer = ({
	customerId,
}: {
	customerId?: string | null;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data } = useQuery<{ customer: FullCustomer }>({
		queryKey: buildKey(["customer", customerId, null, false]),
		queryFn: async () => {
			const { data } = await axiosInstance.get(`/customers/${customerId}`);
			return data;
		},
		enabled: Boolean(customerId),
	});

	const customer = customerId ? data?.customer : undefined;

	return {
		customer,
		bcExclusionFlag: customer ? hasNoBillingCycle({ customer }) : false,
	};
};
