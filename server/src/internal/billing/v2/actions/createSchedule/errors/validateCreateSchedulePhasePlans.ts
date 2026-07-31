import type { FullProduct } from "@autumn/shared";
import { validateProductGroupsByScope } from "../../common/validateProductGroupsByScope";

/** Reject conflicting main recurring plans within the same phase scope. */
export const validateCreateSchedulePhasePlans = ({
	plans,
}: {
	plans: { fullProduct: FullProduct; scopeId?: string }[];
}) => {
	validateProductGroupsByScope({
		plans,
		operation: "Create schedule",
	});
};
