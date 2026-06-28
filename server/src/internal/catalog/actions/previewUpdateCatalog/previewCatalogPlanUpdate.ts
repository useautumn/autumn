import {
	apiPlan,
	expandPathIncludes,
	type FullProduct,
	type PlanUpdatePreview,
	PlanUpdatePreviewSchema,
	PreviewUpdatePlanExpand,
	type PreviewUpdatePlanParamsV2,
	type ProductV2,
	productV2ToApiPlanV1,
	type UpdatePlanParamsV2,
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
	planParams: UpdatePlanParamsV2;
	currency: string;
}): PlanUpdatePreview => {
	const {
		plan_id,
		new_plan_id,
		version: _version,
		variants: _variants,
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
		version: 1,
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
	});
};

export const previewCatalogPlanUpdate = async ({
	ctx,
	planParams,
	current,
	hasCustomers,
	currency,
}: {
	ctx: AutumnContext;
	planParams: UpdatePlanParamsV2;
	current: FullProduct | null;
	hasCustomers: boolean;
	currency: string;
}): Promise<PlanUpdatePreview> => {
	const { plan_id } = planParams;
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
	};
	const incoming = buildIncomingProductV2({ ctx, base: current, data });

	return buildPlanUpdatePreview({
		ctx,
		currentFullProduct: current,
		incomingProductV2: incoming,
		data,
		variantUpdates: variants,
		hasCustomers,
		currency,
	});
};
