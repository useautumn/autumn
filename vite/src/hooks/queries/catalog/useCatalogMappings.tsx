import type {
	CatalogGetMappingsResponse,
	CatalogUpdateMappingsParamsInput,
	UpdateCatalogParamsInput,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const catalogMappingsBaseKey = ["catalog-mappings"] as const;

export type CatalogMappingsSave = {
	/** Plan and variant products: catalogV2 fans them out to every version. */
	catalog?: UpdateCatalogParamsInput;
	/** Runs after `catalog`, so price picks land on the products it set. */
	mappings?: Partial<
		Pick<
			CatalogUpdateMappingsParamsInput,
			"feature_mappings" | "price_mappings"
		>
	>;
	/** Base plans that get a brand-new Stripe product. */
	createPlanIds?: string[];
	/** Variants that get a brand-new Stripe product of their own. */
	splitVariantPlanIds?: string[];
};

export const useCatalogMappings = ({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	const queryKey = buildKey(catalogMappingsBaseKey);

	const mappingsQuery = useQuery({
		queryKey,
		enabled,
		queryFn: async () => {
			const { data } = await axiosInstance.post<CatalogGetMappingsResponse>(
				"/v1/catalog.get_mappings",
				{
					processor_type: "stripe",
				},
			);
			return data;
		},
	});

	const saveMappings = useMutation({
		mutationFn: async ({
			catalog,
			mappings,
			createPlanIds = [],
			splitVariantPlanIds = [],
		}: CatalogMappingsSave) => {
			if (catalog) await CatalogV2Service.update(axiosInstance, catalog);
			for (const planId of createPlanIds) {
				await axiosInstance.post("/v1/plans.create_in_stripe", {
					plan_id: planId,
				});
			}
			// The split route holds an org-wide lock, so variants go one at a time.
			for (const variantPlanId of splitVariantPlanIds) {
				await axiosInstance.post("/v1/plans.split_variant_stripe_product", {
					variant_plan_id: variantPlanId,
				});
			}
			if (mappings) {
				await axiosInstance.post("/v1/catalog.update_mappings", {
					processor_type: "stripe",
					...mappings,
				});
			}
		},
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey }),
				queryClient.invalidateQueries({ queryKey: ["products"] }),
				queryClient.invalidateQueries({ queryKey: ["product"] }),
				queryClient.invalidateQueries({ queryKey: buildKey(["features"]) }),
				queryClient.invalidateQueries({
					queryKey: ["stripe-products-resolve"],
				}),
			]),
		onSuccess: () => {
			toast.success("Stripe mapping saved");
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save mapping"));
		},
	});

	return {
		mappings: mappingsQuery.data,
		isLoading: mappingsQuery.isLoading,
		isFetching: mappingsQuery.isFetching,
		error: mappingsQuery.error,
		saveMappings: saveMappings.mutateAsync,
		isSaving: saveMappings.isPending,
	};
};
