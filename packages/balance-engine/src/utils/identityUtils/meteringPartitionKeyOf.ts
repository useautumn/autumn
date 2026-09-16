import type { MeteringIdentity } from "../../models/meteringIdentity.js";

export const meteringPartitionKeyOf = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);
