import type { ApplyBillingPlanCommand } from "../../commands/applyBillingPlan/types/applyBillingPlanCommand.js";
import type { MeteringIdentity } from "../../models/identity/meteringIdentity.js";

/** The customer's log key: every subject of a customer shares it, so their mutations stay ordered. */
export const meteringIdentityToPartitionKey = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);

/** The customer's key, suffixed by the entity when the identity names an entity. */
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

/** The entities a plan names, each as the identity its own part is held under. */
export const planCommandToEntityIdentities = ({
	command,
}: {
	command: ApplyBillingPlanCommand;
}): MeteringIdentity[] =>
	command.entityIds.map((entityId) => ({ ...command.identity, entityId }));
