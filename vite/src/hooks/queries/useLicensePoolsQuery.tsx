import type {
	LicenseAssignParams,
	LicensePoolResponse,
	LicenseUnassignParams,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const EMPTY_POOLS: LicensePoolResponse[] = [];

/**
 * Loads the customer's license pools (inventory + active assignments) and
 * exposes assign/unassign mutations. Both invalidate the pools and the customer
 * query so provisioned entitlements refresh.
 */
export const useLicensePoolsQuery = ({
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
		list: LicensePoolResponse[];
	}>({
		queryKey: buildKey(["license_pools", customerId ?? null, entityId ?? null]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/v1/licenses.list_pools", {
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
		mutationFn: async (params: LicenseAssignParams) => {
			const { data } = await axiosInstance.post("/v1/licenses.assign", params);
			return data;
		},
		onSuccess: invalidate,
	});

	const unassign = useMutation({
		mutationFn: async (params: LicenseUnassignParams) => {
			const { data } = await axiosInstance.post(
				"/v1/licenses.unassign",
				params,
			);
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
