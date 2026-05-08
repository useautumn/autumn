import type {
	AutumnBillingPlan,
	CreatePlanItemParamsV1,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	MigrateCustomerContext,
	ProcessOperationResult,
} from "../types/index.js";

/**
 * Process one `upsert_items[i]` against ONE matched cusproduct. Folds
 * mutations onto `plan` and returns the updated plan + context.
 *
 * Idempotent: the deterministic customer_entitlement id used here is
 * `cusent_<scopeId>_<cusProduct.id>_<entitlement_id>`, so re-runs on
 * the same migration are a no-op (the executor's existence check
 * skips the insert).
 *
 * NOTE: filled in by the user. This scaffold preserves typing + no-op
 * semantics so the processor compiles end-to-end while the body lands.
 */
export const processUpsertItems = async ({
	ctx,
	migrationContext,
	cusProduct,
	upsertItem,
	plan,
}: {
	ctx: AutumnContext;
	migrationContext: MigrateCustomerContext;
	cusProduct: FullCusProduct;
	upsertItem: CreatePlanItemParamsV1;
	plan: AutumnBillingPlan;
}): Promise<ProcessOperationResult> => {
	void ctx;
	void migrationContext;
	void cusProduct;
	void upsertItem;
	// TODO: implement
	// 1. Resolve prepared cusEnt id from the prepared state passed into this
	//    processor once the migration context shape is finalized.
	// 2. Build deterministic customer_entitlement id
	//    `cusent_<scopeId>_${cusProduct.id}_<entitlement_id>`.
	// 3. Push InsertCustomerEntitlement onto plan.insertCustomerEntitlements.
	// 4. Phase 2: priced items → push to plan.customPrices using prepared price.
	return { plan, migrationContext };
};
