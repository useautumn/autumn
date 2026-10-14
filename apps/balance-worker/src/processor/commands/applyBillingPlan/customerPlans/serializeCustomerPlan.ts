import {
	type ApplyBillingPlanCommand,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";
import { runCustomerPlan } from "./customerPlans.js";

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
