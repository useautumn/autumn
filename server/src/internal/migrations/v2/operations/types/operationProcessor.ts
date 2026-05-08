import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerContext } from "./migrateCustomerContext.js";

/**
 * Output of one processor: the updated AutumnBillingPlan plus the
 * migration context. Keep this minimal until operation processors need
 * richer projected state.
 */
export type ProcessOperationResult = {
	plan: AutumnBillingPlan;
	migrationContext: MigrateCustomerContext;
};

/**
 * Shared contract for every per-op processor. Pure-ish: any DB reads
 * are allowed (catalog lookups, migration inspection); all writes
 * must go through the returned `plan`, which the orchestrator executes
 * later.
 */
export type OperationProcessor<Op> = (args: {
	ctx: AutumnContext;
	migrationContext: MigrateCustomerContext;
	op: Op;
	plan: AutumnBillingPlan;
}) => Promise<ProcessOperationResult>;
