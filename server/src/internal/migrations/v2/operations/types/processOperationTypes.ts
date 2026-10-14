import type {
	AutumnBillingPlan,
	FullCustomer,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerContext } from "./migrateCustomerContext.js";

export type ProcessOperationResult = {
	plan: AutumnBillingPlan;
	projectedFullCustomer: FullCustomer;
	matchedCustomerProducts: number;
	unchangedCustomerProducts: number;
	billingContexts: UpdateSubscriptionBillingContext[];
};

export type OperationProcessor<Op> = (args: {
	ctx: AutumnContext;
	op: Op;
	opIndex: number;
	context: MigrateCustomerContext;
	plan: AutumnBillingPlan;
	projectedFullCustomer: FullCustomer;
}) => Promise<ProcessOperationResult>;
