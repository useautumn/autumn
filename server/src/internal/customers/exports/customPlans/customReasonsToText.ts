import type { CustomReason } from "@/internal/customers/cusProducts/actions/deriveIsCustom/types/customerProductIsCustomResult";

const reasonToText = (reason: CustomReason): string => {
	if ("feature_id" in reason) return `${reason.kind}:${reason.feature_id}`;
	if ("license_plan_id" in reason)
		return `${reason.kind}:${reason.license_plan_id}`;
	return reason.kind;
};

/** One clause per reason, e.g. `price_changed; item_removed:dashboard`, so the column filters cleanly. */
export const customReasonsToText = ({
	reasons,
}: {
	reasons: CustomReason[];
}): string => reasons.map(reasonToText).join("; ");
