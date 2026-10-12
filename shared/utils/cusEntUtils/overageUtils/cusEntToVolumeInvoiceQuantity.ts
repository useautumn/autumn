import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { isPrepaidPrice } from "../../productUtils/priceUtils/classifyPriceUtils";
import { cusEntsToAllowance } from "../balanceUtils/grantedBalanceUtils/cusEntsToAllowance";
import {
	isEntityScopedCusEnt,
	isVolumeBasedCusEnt,
} from "../classifyCusEntUtils";
import { cusEntToCusPrice } from "../convertCusEntUtils/cusEntToCusPrice";

/** Included units that entities under their own allowance left unused. */
const cusEntToUnusedEntityAllowance = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) =>
	Object.values(cusEnt.entities ?? {})
		.reduce(
			(unused, entity) => unused.add(Decimal.max(0, entity.balance)),
			new Decimal(0),
		)
		.toNumber();

/** The quantity a cus ent's price is billed on. Volume tiers price total usage
 * (paid + included), as Stripe does; other prices take the paid quantity as is. */
export const cusEntToVolumeInvoiceQuantity = ({
	cusEnt,
	paidQuantity,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	paidQuantity: number;
}): number => {
	if (!isVolumeBasedCusEnt(cusEnt)) return paidQuantity;

	const allowance = cusEntsToAllowance({ cusEnts: [cusEnt] });
	const total = new Decimal(paidQuantity).add(allowance);

	// Pay-per-use bills the customer's actual usage across entities, so allowance an
	// under-limit entity didn't use is not counted (prepaid bills what was bought).
	const price = cusEntToCusPrice({ cusEnt })?.price;
	const isPayPerUseEntityScoped =
		price !== undefined &&
		!isPrepaidPrice(price) &&
		isEntityScopedCusEnt(cusEnt);
	if (!isPayPerUseEntityScoped) return total.toNumber();

	return total.sub(cusEntToUnusedEntityAllowance({ cusEnt })).toNumber();
};
