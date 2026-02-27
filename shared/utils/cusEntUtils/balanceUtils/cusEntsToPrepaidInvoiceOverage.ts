import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { Decimal } from "decimal.js";
import {
	type FullCusEntWithFullCusProduct,
	isPrepaidPrice,
	isVolumeBasedCusEnt,
	sumValues,
} from "../../..";
import { cusEntToPrepaidQuantity } from "./cusEntsToPrepaidQuantity";
import { cusEntsToAllowance } from "./grantedBalanceUtils/cusEntsToAllowance";

export const cusEntToPrepaidInvoiceOverage = ({
	cusEnt,
	useUpcomingQuantity = false,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	useUpcomingQuantity?: boolean;
}) => {
	// 2. If cus ent is not prepaid, skip
	const cusPrice = cusEntToCusPrice({ cusEnt });

	if (!cusPrice || !isPrepaidPrice(cusPrice.price)) return 0;

	if (!cusEnt.customer_product) return 0;

	// 3. Get quantity
	const prepaidQuantity = cusEntToPrepaidQuantity({
		cusEnt,
		useUpcomingQuantity,
	});
	const allowance = cusEntsToAllowance({ cusEnts: [cusEnt] });

	const isVolume = isVolumeBasedCusEnt(cusEnt);

	return isVolume
		? new Decimal(prepaidQuantity).add(allowance).toNumber()
		: prepaidQuantity;
};

export const cusEntsToPrepaidInvoiceOverage = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToPrepaidInvoiceOverage({
				cusEnt,
			}),
		),
	);
};
