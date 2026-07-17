import {
	apiPlan,
	type CatalogPlanParams,
	expandPathIncludes,
	type FullProduct,
	type PlanUpdatePreview,
	PlanUpdatePreviewSchema,
	PreviewUpdatePlanExpand,
	type PreviewUpdatePlanParamsV2,
	type ProductV2,
	productV2ToApiPlanV1,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildIncomingProductV2 } from "@/internal/product/actions/previewUpdatePlan/buildIncomingProductV2.js";
import { buildPlanUpdatePreview } from "@/internal/product/actions/previewUpdatePlan/previewUpdatePlan.js";

const previewNewPlan = ({
	ctx,
	planParams,
	currency,
}: {
	ctx: AutumnContext;
	planParams: CatalogPlanParams;
	currency: string;
}): PlanUpdatePreview => {
	const {
		plan_id,
		new_plan_id,
		version,
		variants: _variants,
		include_versions: _includeVersions,
		include_variants: _includeVariants,
		...rest
	} = planParams;
	const resolved = apiPlan.map.paramsV1ToProductV2({
		ctx,
		params: {
			id: new_plan_id ?? plan_id,
			...rest,
			add_on: rest.add_on ?? false,
			auto_enable: rest.auto_enable ?? false,
		},
	});
	const product = {
		env: ctx.env,
		version: version ?? 1,
		created_at: Date.now(),
		archived: false,
		...resolved,
		id: new_plan_id ?? plan_id,
		name: resolved.name || new_plan_id || plan_id,
		items: resolved.items ?? [],
		is_add_on: resolved.is_add_on ?? false,
		is_default: resolved.is_default ?? false,
		group: resolved.group ?? "",
	} as ProductV2;
	const plan = productV2ToApiPlanV1({
		product,
		features: ctx.features,
		currency,
	});
	const shouldExpandPlan = expandPathIncludes({
		expand: ctx.expand,
		includes: [PreviewUpdatePlanExpand.Plan],
	});

	return PlanUpdatePreviewSchema.parse({
		plan_id,
		...(shouldExpandPlan ? { plan } : {}),
		has_customers: false,
		versionable: false,
		customize: null,
		previous_attributes: null,
		item_changes: [],
		variants: [],
		other_versions: [],
	});
};

export const previewCatalogPlanUpdate = async ({
	ctx,
	planParams,
	current,
	hasCustomers,
	customerCount,
	currency,
}: {
	ctx: AutumnContext;
	planParams: CatalogPlanParams;
	current: FullProduct | null;
	hasCustomers: boolean;
	customerCount: number;
	currency: string;
}): Promise<PlanUpdatePreview> => {
	const { variants, ...basePlanParams } = planParams;

	if (!current) {
		return previewNewPlan({
			ctx,
			planParams,
			currency,
		});
	}

	const shouldExpandPlan = expandPathIncludes({
		expand: ctx.expand,
		includes: [PreviewUpdatePlanExpand.Plan],
	});
	const data: PreviewUpdatePlanParamsV2 = {
		...basePlanParams,
		variants,
		expand: shouldExpandPlan ? [PreviewUpdatePlanExpand.Plan] : [],
		include_versions: Boolean(
			planParams.include_versions || planParams.all_versions,
		),
		include_variants: Boolean(
			planParams.include_variants ||
				(planParams.all_versions &&
					((planParams.update_variant_ids?.length ?? 0) > 0 ||
						(variants?.length ?? 0) > 0)),
		),
	};
	// Catalog licenses are resolved together against the virtual post-update
	// catalog after ordinary plan previews are built.
	const previewData = {
		...data,
		licenses: undefined,
	};
	const incoming = buildIncomingProductV2({
		ctx,
		base: current,
		data: previewData,
	});

	return buildPlanUpdatePreview({
		ctx,
		currentFullProduct: current,
		incomingProductV2: incoming,
		data: previewData,
		variantUpdates: variants,
		hasCustomers,
		customerCount,
		currency,
	});
};
