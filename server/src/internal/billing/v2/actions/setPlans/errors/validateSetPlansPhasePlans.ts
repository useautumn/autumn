import type { FullProduct } from "@autumn/shared";
import { validateProductGroupsByScope } from "../../common/validateProductGroupsByScope";

export const validateSetPlansPhasePlans = ({
	plans,
}: {
	plans: { fullProduct: FullProduct; scopeId?: string }[];
}) => {
	validateProductGroupsByScope({
		plans,
		operation: "Create schedule",
	});
};
