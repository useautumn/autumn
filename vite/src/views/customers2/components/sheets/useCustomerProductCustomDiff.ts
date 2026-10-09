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
	enabled,
}: {
	customerId?: string;
	customerProductId?: string;
	enabled: boolean;
}) => {
	const axiosInstance = useAxiosInstance();

	return useQuery({
		queryKey: ["customer-product-custom-diff", customerId, customerProductId],
		queryFn: async () => {
			const { data } = await axiosInstance.get<CustomerProductCustomDiff>(
				`/customers/${customerId}/products/${customerProductId}/custom_diff`,
			);
			return data;
		},
		enabled: enabled && !!customerId && !!customerProductId,
		staleTime: 30_000,
	});
};
