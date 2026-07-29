import { Decimal } from "decimal.js";
import type { DbSpendLimit } from "../../../models/cusModels/billingControls/spendLimit.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { cusEntsToMainPlanAllowance } from "./cusEntsToMainPlanAllowance.js";

export const resolveSpendLimitOverageLimit = ({
	spendLimit,
	cusEnts,
	entityId,
	additionalAllowance = 0,
}: {
	spendLimit: DbSpendLimit;
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
	additionalAllowance?: number;
}): number | undefined => {
	if (spendLimit.overage_limit === undefined) return undefined;

	if (spendLimit.limit_type !== "usage_percentage") {
		return spendLimit.overage_limit;
	}

	const denominator =
		cusEntsToMainPlanAllowance({ cusEnts, entityId }) +
		additionalAllowance;
	if (denominator === 0) return undefined;

	return new Decimal(spendLimit.overage_limit)
		.div(100)
		.mul(denominator)
		.toNumber();
};
