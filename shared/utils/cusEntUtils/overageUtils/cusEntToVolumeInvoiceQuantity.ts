import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToAllowance } from "../balanceUtils/grantedBalanceUtils/cusEntsToAllowance";
import { isVolumeBasedCusEnt } from "../classifyCusEntUtils";

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
	return new Decimal(paidQuantity).add(allowance).toNumber();
};
