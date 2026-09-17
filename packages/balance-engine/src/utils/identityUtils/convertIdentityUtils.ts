import type { MeteringIdentity } from "../../models/meteringIdentity.js";

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
