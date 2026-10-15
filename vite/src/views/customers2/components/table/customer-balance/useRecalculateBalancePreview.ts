import type {
	FullCusEntWithFullCusProduct,
	RecalculateBalancePreview,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { getRecalculateBalanceParams } from "./customerBalanceUtils";

export const useRecalculateBalancePreview = ({
	balance,
	entityId,
	enabled,
}: {
	balance: FullCusEntWithFullCusProduct | null;
	entityId: string | null;
	enabled: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const { customer } = useCusQuery();
	const customerId = customer?.id || customer?.internal_id;
	const featureId = balance?.entitlement.feature.id;
	return useQuery({
		queryKey: ["recalculate-balance-preview", customerId, featureId, entityId],
		enabled: enabled && !!customerId && !!balance,
		staleTime: 0,
		gcTime: 0,
		queryFn: async (): Promise<RecalculateBalancePreview> => {
			if (!customerId || !balance) {
				throw new Error("Customer not found");
			}
			const { data } = await axiosInstance.post(
				"/v1/balances.preview_recalculate",
				getRecalculateBalanceParams({ balance, customerId, entityId }),
			);
			return data;
		},
	});
};
