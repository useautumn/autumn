import type {
	ApiPlanV1,
	CustomizePlanLicense,
	PlanLicense,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const EMPTY_PLAN_LICENSES: PlanLicense[] = [];

export type LinkLicenseInput = CustomizePlanLicense & {
	parent_plan_id: string;
};

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
 * `licenses` from plans.get), plus a mutation to link/update one via
 * plans.update. Pass a falsy `parentPlanId` (e.g. when the product is itself
 * a license) to skip the query.
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

	// plans.update takes the complete link set: merge the edited entry into the
	// current links (customize omitted on untouched links preserves theirs).
	const linkLicense = useMutation({
		mutationFn: async ({ parent_plan_id, ...entry }: LinkLicenseInput) => {
			const currentLinks = await fetchPlanLicenses(parent_plan_id);
			const otherLinks: CustomizePlanLicense[] = currentLinks
				.filter((link) => link.license_plan_id !== entry.license_plan_id)
				.map((link) => ({
					license_plan_id: link.license_plan_id,
					included: link.included,
					prepaid_only: link.prepaid_only,
				}));
			const { data } = await axiosInstance.post("/v1/plans.update", {
				plan_id: parent_plan_id,
				licenses: [...otherLinks, entry],
			});
			return data;
		},
		onSuccess: invalidate,
	});

	return {
		planLicenses: data ?? EMPTY_PLAN_LICENSES,
		isLoading,
		error,
		refetch,
		invalidate,
		linkLicense,
	};
};
