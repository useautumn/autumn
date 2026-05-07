import type { CreatePlanItemParamsV1, FullCusProduct } from "@autumn/shared";
import { customerEntitlements } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import type { EnsurePricesAndEntitlementsResult } from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/types.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";

export type ApplyAddItemResult =
	| { status: "added"; customer_entitlement_id: string }
	| { status: "already_present"; customer_entitlement_id: string }
	| {
			status: "skipped";
			reason: "no_prepared_entitlement" | "priced_item_unsupported";
	  };

/** Customer-entitlement deterministic ID per (scope, cusproduct, entitlement). */
const customerEntitlementIdFor = ({
	scopeId,
	cusProductInternalId,
	entitlementId,
}: {
	scopeId: string;
	cusProductInternalId: string;
	entitlementId: string;
}): string => `cusent_${scopeId}_${cusProductInternalId}_${entitlementId}`;

/**
 * Apply ONE add_item to ONE matched cusproduct. Phase 1 handles
 * entitlement-only items; priced items will route through the same
 * flow once `ensurePricesAndEntitlements` provisions Stripe prices.
 */
export const applyAddItem = async ({
	ctx,
	scope_id,
	cusProduct,
	addItem,
	prepared_state,
	dry_run,
}: {
	ctx: AutumnContext;
	scope_id: string;
	cusProduct: FullCusProduct;
	addItem: CreatePlanItemParamsV1;
	prepared_state: PreparedState;
	dry_run: boolean;
}): Promise<ApplyAddItemResult> => {
	if (addItem.price)
		return { status: "skipped", reason: "priced_item_unsupported" };
	if (!addItem.feature_id)
		return { status: "skipped", reason: "no_prepared_entitlement" };

	// Look up the prepared entitlement for (feature, target plan) keyed
	// `ensure_prices_and_entitlements:<feature_id>:<plan_id>`. The
	// matching `entitlement_id` is whichever ref points at this
	// cusproduct's product version.
	const stateKey = `ensure_prices_and_entitlements:${addItem.feature_id}:${cusProduct.product_id}`;
	const slot = prepared_state[stateKey] as
		| EnsurePricesAndEntitlementsResult
		| undefined;
	const ref = slot?.entitlements.find(
		(e) => e.product_internal_id === cusProduct.internal_product_id,
	);
	if (!ref) return { status: "skipped", reason: "no_prepared_entitlement" };

	const customerEntitlementId = customerEntitlementIdFor({
		scopeId: scope_id,
		cusProductInternalId: cusProduct.id,
		entitlementId: ref.entitlement_id,
	});

	const existing = await ctx.db
		.select({ id: customerEntitlements.id })
		.from(customerEntitlements)
		.where(inArray(customerEntitlements.id, [customerEntitlementId]));
	if (existing.length > 0)
		return {
			status: "already_present",
			customer_entitlement_id: customerEntitlementId,
		};

	if (dry_run)
		return { status: "added", customer_entitlement_id: customerEntitlementId };

	await CusEntService.insert({
		ctx,
		data: [
			{
				id: customerEntitlementId,
				customer_product_id: cusProduct.id,
				entitlement_id: ref.entitlement_id,
				internal_customer_id: cusProduct.internal_customer_id,
				internal_feature_id: ref.internal_feature_id,
				feature_id: ref.feature_id,
				customer_id: cusProduct.customer_id ?? null,
				balance: 0,
				created_at: Date.now(),
				usage_allowed: false,
				unlimited: false,
			},
		],
	});

	return { status: "added", customer_entitlement_id: customerEntitlementId };
};
