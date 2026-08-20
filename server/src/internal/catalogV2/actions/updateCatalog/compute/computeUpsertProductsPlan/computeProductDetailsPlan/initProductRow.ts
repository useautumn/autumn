import {
	isPreviewStripeId,
	type Product,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils.js";
import { planParamsToProductRowPatch } from "./planParamsToProductRowPatch";

/**
 * Mint a fresh product row for a create (constructProduct conventions:
 * `group || ""`, nullish fallbacks, generated internal_id).
 * With `base`: clone then overlay params patch (new_version / variant mint).
 */
export const initProductRow = ({
	ctx,
	planParams,
	version,
	base,
	baseInternalProductId,
	baseProcessor,
}: {
	ctx: AutumnContext;
	planParams: UpdateCatalogPlanParams;
	version: number;
	base?: Product;
	/** Variant create: the latest base row. Omit to keep a clone's pointer. */
	baseInternalProductId?: string | null;
	/** Variant create: share the base's Stripe Product. */
	baseProcessor?: Product["processor"];
}): Product => {
	if (base) {
		const patch = planParamsToProductRowPatch({
			planParams,
			current: base,
		});
		return {
			...base,
			...patch,
			version,
			// Mint fresh version identity — the base's slug/active must not ride
			// along on the spread (a cloned slug would collide with the base row
			// on unique_product_version_slug).
			version_slug: `v${version}`,
			active: true,
			internal_id: generateId("prod"),
			created_at: Date.now(),
			group: (patch.group ?? base.group) || "",
			// `?? ` would swallow an explicit detach — only an omitted pointer clones.
			base_internal_product_id:
				baseInternalProductId !== undefined
					? baseInternalProductId
					: (base.base_internal_product_id ?? null),
		};
	}

	const patch = planParamsToProductRowPatch({ planParams, current: null });

	return {
		id: planParams.plan_id,
		name: patch.name ?? planParams.plan_id,
		description: patch.description ?? null,
		is_add_on: patch.is_add_on ?? false,
		is_default: patch.is_default ?? false,
		version,
		version_slug: `v${version}`,
		active: true,
		group: patch.group || "",

		env: ctx.env,
		internal_id: generateId("prod"),
		org_id: ctx.org.id,
		created_at: Date.now(),

		processor:
			baseProcessor && !isPreviewStripeId({ stripeId: baseProcessor.id })
				? baseProcessor
				: null,
		base_variant_id: null,
		base_internal_product_id: baseInternalProductId ?? null,
		archived: patch.archived ?? false,
		config: { ignore_past_due: patch.config?.ignore_past_due ?? false },
		metadata: patch.metadata ?? {},
		auto_topups: patch.auto_topups ?? null,
		spend_limits: patch.spend_limits ?? null,
		usage_limits: patch.usage_limits ?? null,
		usage_alerts: patch.usage_alerts ?? null,
		overage_allowed: patch.overage_allowed ?? null,
	};
};
