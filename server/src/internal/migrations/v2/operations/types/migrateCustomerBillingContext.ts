import type {
	BillingContext,
	CustomerOperations,
	FullCusProduct,
	Migration,
} from "@autumn/shared";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";

/**
 * Per-customer billing context for the migration runner. Extends the
 * standard `BillingContext` with migration metadata + the evolving
 * `projected_cusproducts` view (post-op snapshot of the customer's
 * cusproducts, threaded through processors as the plan folds).
 */
export type MigrateCustomerBillingContext = BillingContext & {
	migration: Migration;
	scope_id: string;
	prepared_state: PreparedState;
	operations: CustomerOperations;

	/**
	 * Reflects what the customer's cusproducts will look like AFTER the
	 * AutumnBillingPlan executes. Starts equal to
	 * `fullCustomer.customer_products` and gets updated by each processor
	 * so downstream ops (e.g. `update_plans` after `add_plans`) can
	 * target newly-attached / not-yet-expired plans correctly.
	 */
	projected_cusproducts: FullCusProduct[];
};
