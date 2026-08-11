import type { Product, UpdateCatalogPlanParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils.js";
import { planParamsToProductRowPatch } from "./planParamsToProductRowPatch";

/**
 * Mint a fresh product row for a create (constructProduct conventions:
 * `group || ""`, nullish fallbacks, generated internal_id).
 * `base` reserved for new-version / variant mints (clone with fresh ids).
 */
export const initProductRow = ({
	ctx,
	planParams,
	version,
	base,
}: {
	ctx: AutumnContext;
	planParams: UpdateCatalogPlanParams;
	version: number;
	base?: Product;
}): Product => {
	if (base) {
		throw new Error("initProductRow: base mint not implemented yet");
	}

	const patch = planParamsToProductRowPatch({ planParams, current: null });

	return {
		id: planParams.plan_id,
		name: patch.name ?? planParams.plan_id,
		description: patch.description ?? null,
		is_add_on: patch.is_add_on ?? false,
		is_default: patch.is_default ?? false,
		version,
		group: patch.group || "",

		env: ctx.env,
		internal_id: generateId("prod"),
		org_id: ctx.org.id,
		created_at: Date.now(),

		processor: null,
		base_variant_id: null,
		base_internal_product_id: null,
		archived: patch.archived ?? false,
		config: { ignore_past_due: patch.config?.ignore_past_due ?? false },
		metadata: patch.metadata ?? {},
	};
};
