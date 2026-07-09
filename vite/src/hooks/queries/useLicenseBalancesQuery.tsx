import type {
	LicenseAttachParams,
	LicenseBalanceResponse,
	UpdateLicenseParams,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const EMPTY_POOLS: LicenseBalanceResponse[] = [];

/**
 * Loads the customer's license pools (inventory + active assignments) and
 * exposes assign/unassign mutations. Both invalidate the pools and the customer
 * query so provisioned entitlements refresh.
 */
export const useLicenseBalancesQuery = ({
	customerId,
	entityId,
	enabled = true,
}: {
	customerId?: string;
	entityId?: string;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery<{
		list: LicenseBalanceResponse[];
	}>({
		queryKey: buildKey(["license_pools", customerId ?? null, entityId ?? null]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/v1/licenses.list", {
				customer_id: customerId,
				entity_id: entityId,
			});
			return data;
		},
		enabled: enabled && Boolean(customerId),
	});

	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["license_pools"] }),
			queryClient.invalidateQueries({ queryKey: ["customer"] }),
		]);

	const assign = useMutation({
		mutationFn: async (params: LicenseAttachParams) => {
			const { data } = await axiosInstance.post("/v1/licenses.attach", params);
			return data;
		},
		onSuccess: invalidate,
	});

	const unassign = useMutation({
		mutationFn: async (params: Omit<UpdateLicenseParams, "cancel_action">) => {
			const { data } = await axiosInstance.post("/v1/licenses.update", {
				...params,
				cancel_action: "cancel_immediately",
			});
			return data;
		},
		onSuccess: invalidate,
	});

	return {
		pools: data?.list ?? EMPTY_POOLS,
		isLoading,
		error,
		refetch,
		invalidate,
		assign,
		unassign,
	};
};
