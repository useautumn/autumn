import type { MeteringIdentity } from "../../models/identity/meteringIdentity.js";

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
