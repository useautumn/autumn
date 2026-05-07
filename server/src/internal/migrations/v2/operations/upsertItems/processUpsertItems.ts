import type {
	AutumnBillingPlan,
	CreatePlanItemParamsV1,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ProcessOperationResult } from "../types/index.js";
import type { MigrateCustomerBillingContext } from "../types/migrateCustomerBillingContext.js";

/**
 * Process one `upsert_items[i]` against ONE matched cusproduct. Folds
 * mutations onto `plan` and returns the updated plan + context.
 *
 * Idempotent: the deterministic customer_entitlement id used here is
 * `cusent_<scope_id>_<cusProduct.id>_<entitlement_id>`, so re-runs on
 * the same migration are a no-op (the executor's existence check
 * skips the insert).
 *
 * NOTE: filled in by the user. This scaffold preserves typing + no-op
 * semantics so the processor compiles end-to-end while the body lands.
 */
export const processUpsertItems = async ({
	ctx,
	billingContext,
	cusProduct,
	upsertItem,
	plan,
}: {
	ctx: AutumnContext;
	billingContext: MigrateCustomerBillingContext;
	cusProduct: FullCusProduct;
	upsertItem: CreatePlanItemParamsV1;
	plan: AutumnBillingPlan;
}): Promise<ProcessOperationResult> => {
	void ctx;
	void cusProduct;
	void upsertItem;
	// TODO: implement
	// 1. Resolve prepared cusEnt id from
	//    billingContext.prepared_state[`ensure_prices_and_entitlements:${upsertItem.feature_id}:${cusProduct.product_id}`]
	//    matching cusProduct.internal_product_id.
	// 2. Build deterministic customer_entitlement id
	//    `cusent_${billingContext.scope_id}_${cusProduct.id}_<entitlement_id>`.
	// 3. Push InsertCustomerEntitlement onto plan.insertCustomerEntitlements.
	// 4. Phase 2: priced items → push to plan.customPrices using prepared price.
	return { plan, billingContext };
};
