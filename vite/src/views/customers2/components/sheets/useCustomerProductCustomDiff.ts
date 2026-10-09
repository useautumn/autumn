import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type CustomDiffField = {
	path: string;
	catalog: string | null;
	customer: string | null;
};

export type CustomDiffChange = {
	target: "base_price" | "item" | "license";
	id: string | null;
	kind: "added" | "removed" | "changed";
	fields: CustomDiffField[];
};

export type CustomerProductCustomDiff = {
	is_custom: boolean;
	reason:
		| "customized"
		| "matches_catalog"
		| "revenuecat"
		| "catalog_missing"
		| "comparison_failed";
	changes: CustomDiffChange[];
};

export const useCustomerProductCustomDiff = ({
	customerId,
	customerProductId,
}: {
	customerId?: string;
	customerProductId?: string;
}) => {
	const axiosInstance = useAxiosInstance();

	return useQuery({
		// Under "customer", so billing writes that refresh the customer refresh this too.
		queryKey: ["customer", customerId, "custom-diff", customerProductId],
		queryFn: async () => {
			const { data } = await axiosInstance.get<CustomerProductCustomDiff>(
				`/customers/${customerId}/products/${customerProductId}/custom_diff`,
			);
			return data;
		},
		enabled: !!customerId && !!customerProductId,
		staleTime: 30_000,
	});
};
