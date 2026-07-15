import type {
	ApiCustomerLicenseV0,
	AttachLicenseParamsV0,
	ReleaseLicenseParamsV0,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type LicenseAssignment = {
	id: string;
	entity_id: string;
	license_plan_id: string;
	started_at: number;
	ended_at: number | null;
};

const EMPTY_POOLS: ApiCustomerLicenseV0[] = [];
const EMPTY_ASSIGNMENTS: LicenseAssignment[] = [];

/**
 * Loads the customer's license pools and active assignments, and exposes
 * assign/unassign mutations. Mutations invalidate pools, assignments, and the
 * customer query so provisioned entitlements refresh.
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
		list: ApiCustomerLicenseV0[];
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

	// All active assignments for the customer; consumers scope by entity so a
	// single cache entry serves the section, button, and detail sheet.
	const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery<{
		list: LicenseAssignment[];
	}>({
		queryKey: buildKey(["license_assignments", customerId ?? null]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/v1/licenses.list_assignments",
				{
					customer_id: customerId,
					active: true,
				},
			);
			return data;
		},
		enabled: enabled && Boolean(customerId),
	});

	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["license_pools"] }),
			queryClient.invalidateQueries({ queryKey: ["license_assignments"] }),
			queryClient.invalidateQueries({ queryKey: ["customer"] }),
		]);

	const assign = useMutation({
		mutationFn: async (params: AttachLicenseParamsV0) => {
			const { data } = await axiosInstance.post("/v1/licenses.attach", params);
			return data;
		},
		onSuccess: invalidate,
	});

	const unassign = useMutation({
		mutationFn: async (params: ReleaseLicenseParamsV0) => {
			const { data } = await axiosInstance.post("/v1/licenses.release", params);
			return data;
		},
		onSuccess: invalidate,
	});

	return {
		pools: data?.list ?? EMPTY_POOLS,
		assignments: assignmentsData?.list ?? EMPTY_ASSIGNMENTS,
		isLoading: isLoading || assignmentsLoading,
		error,
		refetch,
		invalidate,
		assign,
		unassign,
	};
};
