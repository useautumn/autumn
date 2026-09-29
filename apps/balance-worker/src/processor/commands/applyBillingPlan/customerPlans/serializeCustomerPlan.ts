import {
	type ApplyBillingPlanCommand,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";
import { runCustomerPlan } from "./customerPlans.js";

/** One plan at a time per customer, from its first read to its rows being stored: the next plan's reads see everything this one wrote, in memory and in Postgres. */
export const serializeCustomerPlan = <Result>({
	scope,
	command,
	run,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
	run: () => Promise<Result>;
}): Promise<Result> =>
	runCustomerPlan({
		customerPlans: scope.customerPlans,
		customerKey: meteringIdentityToPartitionKey({ identity: command.identity }),
		run,
	});
