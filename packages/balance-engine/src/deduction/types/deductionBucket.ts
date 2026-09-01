import type { LeanCustomerEntitlement } from "../../common/types/customerState/customerStateTypes.js";

// One clamp on one entitlement. `spend_included` deducts down to the floor;
// `spend_overage` with a null limit is an unclamped sink (overflow). Refund
// and unlimited kinds join this union when those behaviors land.
export type DeductionBucket = {
	customerEntitlement: LeanCustomerEntitlement;
	kind: "spend_included" | "spend_overage";
	limit: number | null;
};
