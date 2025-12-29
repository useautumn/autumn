import { Decimal } from "decimal.js";
import {
	cusEntToIncludedUsage,
	type FullCusEntWithFullCusProduct,
	type FullCusEntWithOptionalProduct,
	isPrepaidCusEnt,
	notNullish,
	nullish,
} from "../../../index.js";

export const cusEntsToMaxPurchase = ({
	cusEnts,
	entityId,
}: {
	cusEnts: (FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct)[];
	entityId?: string;
}): number | null => {
	// 1. If there's usage-based cus ent, return undefined
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

	// 2. If there's usage-based cus ent, and prepaid no limit
	if (hasUsageBased && hasPrepaidNoLimit) return null;

	// 3. If there's prepaid
	if (hasPrepaidNoLimit) return null;

	// 3. If there's no prepaid and no usage-based, return undefined (free feature)
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
