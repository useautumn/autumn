import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import { meteringPartitionKeyOf } from "./meteringPartitionKeyOf.js";

/** The customer's key, suffixed by the entity when the identity names an entity view. */
export const meteringIdentityToSubjectKey = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string => {
	const customerKey = meteringPartitionKeyOf({ identity });
	return identity.entityId
		? `${customerKey}:${identity.entityId}`
		: customerKey;
};
