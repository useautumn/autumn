import type {
	AutumnBillingPlan,
	FullCustomer,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerContext } from "./migrateCustomerContext.js";

/**
 * Output of one processor: the updated AutumnBillingPlan plus lightweight
 * metadata used by the ordered operation fold.
 */
export type ProcessOperationResult = {
	plan: AutumnBillingPlan;
	projectedFullCustomer: FullCustomer;
	matchedCustomerProducts: number;
	billingContexts: UpdateSubscriptionBillingContext[];
};

/**
 * Shared contract for every per-op processor. Pure-ish: any DB reads
 * are allowed (catalog lookups, migration inspection); all writes
 * must go through the returned `plan`, which the orchestrator executes
 * later.
 */
export type OperationProcessor<Op> = (args: {
	ctx: AutumnContext;
	op: Op;
	context: MigrateCustomerContext;
	plan: AutumnBillingPlan;
	projectedFullCustomer: FullCustomer;
}) => Promise<ProcessOperationResult>;
