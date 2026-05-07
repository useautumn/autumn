import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerBillingContext } from "./migrateCustomerBillingContext.js";

/**
 * Output of one processor: the updated AutumnBillingPlan plus the
 * (possibly-updated) MigrateCustomerBillingContext. Returning the
 * context lets a processor evolve `projected_cusproducts` so later
 * processors see the post-op view of the customer.
 */
export type ProcessOperationResult = {
	plan: AutumnBillingPlan;
	billingContext: MigrateCustomerBillingContext;
};

/**
 * Shared contract for every per-op processor. Pure-ish: any DB reads
 * are allowed (catalog lookups, prepared_state inspection); all writes
 * must go through the returned `plan`, which the orchestrator executes
 * later.
 */
export type OperationProcessor<Op> = (args: {
	ctx: AutumnContext;
	billingContext: MigrateCustomerBillingContext;
	op: Op;
	plan: AutumnBillingPlan;
}) => Promise<ProcessOperationResult>;
