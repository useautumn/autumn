import {
	type FullCustomer,
	filterCustomerProductsByActiveStatuses,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** A customer on only default plans has no billing cycle to anchor ranges on. */
const hasNoBillingCycle = ({ customer }: { customer: FullCustomer }) =>
	filterCustomerProductsByActiveStatuses({
		customerProducts: customer.customer_products,
	}).every(({ product }) => product.is_default);

/** The customer the analytics view is filtered to, if any. */
export const useAnalyticsCustomer = ({
	customerId,
}: {
	customerId?: string | null;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	// Same key and payload as useCusQuery's default fetch, so the two share a cache entry.
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
