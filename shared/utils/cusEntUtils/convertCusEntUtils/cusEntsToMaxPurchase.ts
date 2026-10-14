import { Decimal } from "decimal.js";
import {
	cusEntToIncludedUsage,
	type CustomerEntitlementWithPricesView,
	isPrepaidCusEnt,
	notNullish,
	nullish,
} from "../../../index.js";

export const cusEntsToMaxPurchase = ({
	cusEnts,
	entityId,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	entityId?: string;
}): number | null => {
	if (
		cusEnts.some(
			(cusEnt) =>
				cusEnt.usage_allowed && nullish(cusEnt.entitlement.usage_limit),
		)
	) {
		return null;
	}

	const hasPrepaidNoLimit = cusEnts.some(
		(ce) =>
			isPrepaidCusEnt({ cusEnt: ce }) && nullish(ce.entitlement.usage_limit),
	);
	const hasPrepaid = cusEnts.some((ce) => isPrepaidCusEnt({ cusEnt: ce }));
	const hasUsageBased = cusEnts.some((ce) => ce.usage_allowed);

	if (hasUsageBased && hasPrepaidNoLimit) return null;

	if (hasPrepaidNoLimit) return null;

	if (!hasPrepaid && !hasUsageBased) return null;

	let maxPurchase = new Decimal(0);
	for (const cusEnt of cusEnts) {
		const startingBalance = cusEntToIncludedUsage({
			cusEnt,
			entityId,
		});
		const usageLimit = cusEnt.entitlement.usage_limit;

		if (notNullish(usageLimit) && notNullish(startingBalance)) {
			maxPurchase = maxPurchase.add(
				new Decimal(usageLimit).sub(startingBalance),
			);
		}
	}

	return maxPurchase.toNumber();
};
