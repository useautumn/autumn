import type { PlanLicense, SetPlanLicenseParams } from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const EMPTY_PLAN_LICENSES: PlanLicense[] = [];

/**
 * Loads the license offerings configured on a parent plan, plus a mutation to
 * link/update one. Pass a falsy `parentPlanId` (e.g. when the product is itself
 * a license) to skip the query.
 */
export const usePlanLicensesQuery = (parentPlanId?: string) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery<{ list: PlanLicense[] }>(
		{
			queryKey: buildKey(["plan_licenses", parentPlanId ?? null]),
			queryFn: async () => {
				const { data } = await axiosInstance.post(
					"/v1/licenses.list_plan_licenses",
					{ parent_plan_id: parentPlanId },
				);
				return data;
			},
			enabled: Boolean(parentPlanId),
		},
	);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["plan_licenses"] });

	const setPlanLicense = useMutation({
		mutationFn: async (params: SetPlanLicenseParams) => {
			const { data } = await axiosInstance.post(
				"/v1/licenses.set_plan_license",
				params,
			);
			return data;
		},
		onSuccess: invalidate,
	});

	return {
		planLicenses: data?.list ?? EMPTY_PLAN_LICENSES,
		isLoading,
		error,
		refetch,
		invalidate,
		setPlanLicense,
	};
};
