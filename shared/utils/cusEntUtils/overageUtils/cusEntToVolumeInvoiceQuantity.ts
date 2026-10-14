import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { isPrepaidPrice } from "../../productUtils/priceUtils/classifyPriceUtils";
import { sumValues } from "../../utils";
import { cusEntsToAllowance } from "../balanceUtils/grantedBalanceUtils/cusEntsToAllowance";
import {
	isEntityScopedCusEnt,
	isVolumeBasedCusEnt,
} from "../classifyCusEntUtils";
import { cusEntToCusPrice } from "../convertCusEntUtils/cusEntToCusPrice";

const cusEntToUnusedEntityAllowance = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) =>
	sumValues(
		Object.values(cusEnt.entities ?? {}).map((entity) =>
			Math.max(0, entity.balance),
		),
	);

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

	const price = cusEntToCusPrice({ cusEnt })?.price;
	const isPayPerUseEntityScoped =
		price !== undefined &&
		!isPrepaidPrice(price) &&
		isEntityScopedCusEnt(cusEnt);
	if (!isPayPerUseEntityScoped) return total.toNumber();

	return total.sub(cusEntToUnusedEntityAllowance({ cusEnt })).toNumber();
};
