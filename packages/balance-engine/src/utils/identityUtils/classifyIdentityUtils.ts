import type { MeteringIdentity } from "../../models/meteringIdentity.js";

/** Same customer log, whichever subject of it each identity names. */
export const isSameCustomerIdentity = ({
	left,
	right,
}: {
	left: MeteringIdentity;
	right: MeteringIdentity;
}): boolean =>
	left.orgId === right.orgId &&
	left.env === right.env &&
	left.customerId === right.customerId;
