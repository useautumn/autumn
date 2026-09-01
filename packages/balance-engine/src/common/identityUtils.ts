import type { MeteringIdentity } from "./types/meteringIdentity.js";

export const identitiesMatch = ({
	left,
	right,
}: {
	left: MeteringIdentity;
	right: MeteringIdentity;
}): boolean =>
	left.orgId === right.orgId &&
	left.env === right.env &&
	left.customerId === right.customerId;

// The Kafka partition key: everything for one customer serializes here.
export const meteringPartitionKeyOf = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);
