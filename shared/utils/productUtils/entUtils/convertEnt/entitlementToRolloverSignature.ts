import type { Entitlement } from "@models/productModels/entModels/entModels";
import type { RolloverConfig } from "@models/productV2Models/productItemModels/productItemModels";

/** Field-by-field encoding matching rolloversAreSame's loose-null semantics. */
export const rolloverToSignature = ({
	rollover,
}: {
	rollover?: RolloverConfig | null;
}): string => {
	if (!rollover) return "none";

	return JSON.stringify({
		max: rollover.max ?? null,
		max_percentage: rollover.max_percentage ?? null,
		duration: rollover.duration ?? null,
		length: rollover.length ?? null,
	});
};

export const entitlementToRolloverSignature = ({
	entitlement,
}: {
	entitlement: Entitlement;
}): string => rolloverToSignature({ rollover: entitlement.rollover });
