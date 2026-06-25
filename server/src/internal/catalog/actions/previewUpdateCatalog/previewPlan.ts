import {
	apiPlan,
	buildMigrationDraft,
	type CatalogPlanPreview,
	type FullProduct,
	type ProductV2,
	productsAreSame,
	productV2ToApiPlanV1,
	type UpdatePlanParamsV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

/**
 * Resolve a single proposed plan change without persisting: the resulting plan
 * plus whether applying it would version the plan and the migration it implies.
 */
export const previewPlan = async ({
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
}): Promise<CatalogPlanPreview> => {
	const { plan_id, new_plan_id, version: _version, ...rest } = planParams;

	const resolved = apiPlan.map.paramsV1ToProductV2({
		ctx,
		params: { id: new_plan_id ?? plan_id, ...rest },
		currentFullProduct: current ?? undefined,
	});
	const product = {
		env: ctx.env,
		version: current?.version ?? 1,
		created_at: current?.created_at ?? Date.now(),
		...resolved,
	} as ProductV2;

	const plan = productV2ToApiPlanV1({
		product,
		features: ctx.features,
		currency,
	});

	let willVersion = false;
	let migrationDraft: CatalogPlanPreview["migration_draft"] = null;

	if (current) {
		const { itemsSame, freeTrialsSame } = productsAreSame({
			newProductV2: product,
			curProductV1: current,
			features: ctx.features,
		});
		willVersion = !(itemsSame && freeTrialsSame) && hasCustomers;

		if (willVersion) {
			const from = await getPlanResponse({
				ctx,
				product: current,
				features: ctx.features,
				currency,
			});
			migrationDraft = buildMigrationDraft({
				from,
				to: plan,
				planId: plan_id,
				version: current.version,
				scope: "all_customers",
			});
		}
	}

	return {
		plan,
		will_version: willVersion,
		has_customers: hasCustomers,
		migration_draft: migrationDraft,
	};
};
