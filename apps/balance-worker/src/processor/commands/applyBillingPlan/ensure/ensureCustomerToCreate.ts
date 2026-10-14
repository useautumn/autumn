import {
	type ApplyBillingPlanCommand,
	planInsertedCustomer,
} from "@autumn/balance-engine";
import { SubjectNotFoundError } from "../../../subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";

const claimEmailOnlyCustomer = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): Promise<boolean> => {
	const email = planInsertedCustomer({ command })?.email;
	if (!email) return false;
	const claimedInternalId = await scope.ctx.db.claimCustomerByEmail({
		identity: command.identity,
		email,
	});
	return claimedInternalId !== null;
};

export const ensureCustomerToCreate = async ({
	scope,
	command,
}: {
	scope: PartitionProcessorScope;
	command: ApplyBillingPlanCommand;
}): Promise<void> => {
	const { subjectHydrator } = scope.ctx;
	const { identity } = command;
	try {
		await subjectHydrator.ensure({ identity });
		return;
	} catch (error) {
		if (!(error instanceof SubjectNotFoundError)) throw error;
	}
	if (await claimEmailOnlyCustomer({ scope, command }))
		await subjectHydrator.ensure({ identity });
};
