import {
	type ApplyBillingPlanCommand,
	planInsertedCustomer,
} from "@autumn/balance-engine";
import { SubjectNotFoundError } from "../../../subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../../types/partitionProcessor.js";

/** An email-only customer has no id, so no partition: the plan creating a customer with its email takes it over in Postgres. */
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

/** The customer the plan would create, if it already exists: held, in Postgres, or an email-only customer it claims, which then loads like any other. */
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
