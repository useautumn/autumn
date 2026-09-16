import type { MeteringIdentity } from "../../models/meteringIdentity.js";

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
