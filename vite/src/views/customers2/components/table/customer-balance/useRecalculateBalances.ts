import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { getRecalculateBalanceParams } from "./customerBalanceUtils";

export const useRecalculateBalances = ({
	entityId,
}: {
	entityId: string | null;
}) => {
	const axiosInstance = useAxiosInstance();
	const { customer, refetch } = useCusQuery();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();
	const customerId = customer?.id || customer?.internal_id;
	return useMutation({
		mutationFn: async ({
			balance,
		}: {
			balance: FullCusEntWithFullCusProduct;
		}) => {
			if (!customerId) {
				throw new Error("Customer not found");
			}
			await axiosInstance.post(
				"/v1/balances.recalculate",
				getRecalculateBalanceParams({ balance, customerId, entityId }),
			);
		},
		onSuccess: async () => {
			toast.success("Balances recalculated");
			await Promise.all([
				refetch(),
				queryClient.invalidateQueries({
					queryKey: buildQueryKey(["customer", customerId]),
				}),
			]);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to recalculate balances"));
		},
	});
};
