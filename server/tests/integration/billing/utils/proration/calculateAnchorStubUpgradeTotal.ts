import { Decimal } from "decimal.js";
import { calculateNewSubscriptionAnchorStub } from "./calculateNewSubscriptionAnchorStub";
import { calculateProrationFromPeriod } from "./calculateProration";

const floorToSecond = (ms: number) => Math.floor(ms / 1000) * 1000;

export const calculateAnchorStubUpgradeTotal = ({
	attachedAt,
	upgradedAt,
	anchorMs,
	oldAmount,
	newAmount,
}: {
	attachedAt: number;
	upgradedAt: number;
	anchorMs: number;
	oldAmount: number;
	newAmount: number;
}): number => {
	const newPlanCharge = calculateNewSubscriptionAnchorStub({
		advancedTo: upgradedAt,
		anchorMs,
		amount: newAmount,
	});
	const oldStubCharge = calculateNewSubscriptionAnchorStub({
		advancedTo: attachedAt,
		anchorMs,
		amount: oldAmount,
	});
	const oldPlanCredit = calculateProrationFromPeriod({
		billingPeriod: { start: floorToSecond(attachedAt), end: anchorMs },
		advancedTo: upgradedAt,
		amount: oldStubCharge,
	});

	return new Decimal(newPlanCharge)
		.minus(oldPlanCredit)
		.toDecimalPlaces(2)
		.toNumber();
};
