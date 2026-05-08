import type { BillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";

export type MigrateCustomerExecuteMode = "no_changes" | "stripe";

/**
 * Routes execution based on resolved billing mode.
 *  - `no_changes`: DB-only via `executeAutumnBillingPlan` (no Stripe)
 *  - `stripe`: full path via `executeBillingPlan` (Stripe + DB)
 *
 * Mode resolution lives in `evaluateMigrateCustomerStripe`; this fn
 * just dispatches.
 */
export const executeMigrateCustomerPlan = async ({
	ctx,
	migrationContext,
	billingPlan,
	mode,
}: {
	ctx: AutumnContext;
	migrationContext: MigrateCustomerContext;
	billingPlan: BillingPlan;
	mode: MigrateCustomerExecuteMode;
}): Promise<void> => {
	void migrationContext;
	if (mode === "no_changes") {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: billingPlan.autumn,
		});
		return;
	}
	throw new Error(
		"executeMigrateCustomerPlan: stripe mode needs a per-subscription BillingContext",
	);
};
