import {
	apiPlan,
	type FullProduct,
	mapToProductV2,
	mergeBillingControls,
	type PreviewUpdatePlanParamsV2,
	type ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const buildIncomingProductV2 = ({
	ctx,
	base,
	data,
}: {
	ctx: AutumnContext;
	base: FullProduct;
	data: PreviewUpdatePlanParamsV2;
}): ProductV2 => {
	const {
		plan_id,
		new_plan_id,
		disable_version,
		version,
		force_version,
		update_variant_ids,
		variants: _variants,
		all_versions: _allVersions,
		include_versions: _includeVersions,
		include_variants: _includeVariants,
		expand,
		...planParams
	} = data;

	const current = mapToProductV2({ product: base, features: ctx.features });
	const patch = apiPlan.map.paramsV1ToProductV2({
		ctx,
		currentFullProduct: base,
		params: {
			...(new_plan_id !== undefined ? { id: new_plan_id } : {}),
			...planParams,
		},
	});
	if (patch.group === "" && base.group !== "") {
		delete patch.group;
	}

	return {
		...current,
		...patch,
		items: patch.items ?? current.items,
		billing_controls: mergeBillingControls(
			current.billing_controls,
			patch.billing_controls,
		),
	};
};
