import {
	apiPlan,
	buildMigrationDraft,
	type CatalogPlanPreview,
	composeMatchKey,
	diffPlanV1,
	type FullProduct,
	type ProductV2,
	planItemFilterMatchKey,
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
		// Project the post-update plan: keep the existing name when the update
		// doesn't change it (falling back to the id for a brand-new plan).
		name: resolved.name || current?.name || plan_id,
	} as ProductV2;

	const plan = productV2ToApiPlanV1({
		product,
		features: ctx.features,
		currency,
	});

	let willVersion = false;
	let migrationDraft: CatalogPlanPreview["migration_draft"] = null;
	let diff: CatalogPlanPreview["diff"] = null;

	if (current) {
		const { itemsSame, freeTrialsSame } = productsAreSame({
			newProductV2: product,
			curProductV1: current,
			features: ctx.features,
		});
		willVersion = !(itemsSame && freeTrialsSame) && hasCustomers;

		// Always diff current → proposed for the preview card; the migration draft
		// (customer-facing) reuses the same diff but only when a version is forced.
		const from = await getPlanResponse({
			ctx,
			product: current,
			features: ctx.features,
			currency,
		});
		const rawDiff = diffPlanV1({ from, to: plan });

		// Resolve the lossy add/remove filters back to full items (with display
		// text) from each side, so the card renders real "10,000 agent requests".
		const addedKeys = new Set((rawDiff.add_items ?? []).map(composeMatchKey));
		const removedKeys = new Set(
			(rawDiff.remove_items ?? []).map(planItemFilterMatchKey),
		);
		diff = {
			added_items: plan.items.filter((item) =>
				addedKeys.has(composeMatchKey(item)),
			),
			removed_items: from.items.filter((item) =>
				removedKeys.has(composeMatchKey(item)),
			),
			price: rawDiff.price,
		};

		if (willVersion) {
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
		...plan,
		will_version: willVersion,
		has_customers: hasCustomers,
		migration_draft: migrationDraft,
		diff,
	};
};
