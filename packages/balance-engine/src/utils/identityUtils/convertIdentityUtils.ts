import type { ApplyBillingPlanCommand } from "../../commands/applyBillingPlan/types/applyBillingPlanCommand.js";
import type { MeteringIdentity } from "../../models/identity/meteringIdentity.js";

export const meteringIdentityToPartitionKey = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);

export const partitionKeyToMeteringIdentity = ({
	partitionKey,
}: {
	partitionKey: string;
}): MeteringIdentity => {
	const [orgId, env, customerId] = JSON.parse(partitionKey) as [
		string,
		string,
		string,
	];
	return { orgId, env, customerId, entityId: null };
};

export const meteringIdentityToSubjectKey = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string => {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	return identity.entityId
		? `${customerKey}:${identity.entityId}`
		: customerKey;
};

export const planCommandToEntityIdentities = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): MeteringIdentity[] =>
	command.entityIds.map((entityId) => ({ ...command.identity, entityId }));
