import type { ApiPlanV1, PlanLicense } from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const EMPTY_PLAN_LICENSES: PlanLicense[] = [];

const toPlanLicenses = ({
	parentPlanId,
	licenses,
}: {
	parentPlanId: string;
	licenses: NonNullable<ApiPlanV1["licenses"]>;
}): PlanLicense[] =>
	licenses.map((link) => ({
		id: `${parentPlanId}:${link.license_plan_id}`,
		parent_plan_id: parentPlanId,
		license_plan_id: link.license_plan_id,
		included: link.included,
		prepaid_only: link.prepaid_only,
		customize: link.customize ?? null,
		metadata: null,
		created_at: 0,
		updated_at: 0,
	}));

/**
 * Loads the license offerings configured on a parent plan (the plan's
 * `licenses` from plans.get). Pass a falsy `parentPlanId` (e.g. when the
 * product is itself a license) to skip the query. Writes go through the plan
 * save bar, which composes the full `licenses` array into one plans.update.
 */
export const usePlanLicensesQuery = (parentPlanId?: string) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const fetchPlanLicenses = async (planId: string) => {
		const { data } = await axiosInstance.post<ApiPlanV1>("/v1/plans.get", {
			plan_id: planId,
		});
		return toPlanLicenses({
			parentPlanId: planId,
			licenses: data.licenses ?? [],
		});
	};

	const { data, isLoading, error, refetch } = useQuery<PlanLicense[]>({
		queryKey: buildKey(["plan_licenses", parentPlanId ?? null]),
		queryFn: () => fetchPlanLicenses(parentPlanId as string),
		enabled: Boolean(parentPlanId),
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["plan_licenses"] });

	return {
		planLicenses: data ?? EMPTY_PLAN_LICENSES,
		isLoading,
		error,
		refetch,
		invalidate,
	};
};
