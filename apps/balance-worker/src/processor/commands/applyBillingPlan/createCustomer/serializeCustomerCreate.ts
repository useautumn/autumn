import {
	type ApplyBillingPlanCommand,
	meteringIdentityToPartitionKey,
	planInsertsCustomer,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";
import { runCustomerCreate } from "./customerCreates.js";

/** A plan creating the customer waits for any earlier create of it, so nothing assigns the id between its claim, check and insert. */
export const serializeCustomerCreate = <Result>({
	scope,
	command,
	run,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
	run: () => Promise<Result>;
}): Promise<Result> =>
	planInsertsCustomer({ command })
		? runCustomerCreate({
				customerCreates: scope.customerCreates,
				customerKey: meteringIdentityToPartitionKey({
					identity: command.identity,
				}),
				run,
			})
		: run();
