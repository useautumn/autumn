import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import {
	type FullCusEntWithFullCusProduct,
	isPrepaidPrice,
	sumValues,
} from "../../..";
import { cusEntToVolumeInvoiceQuantity } from "../overageUtils/cusEntToVolumeInvoiceQuantity";
import { cusEntToPrepaidQuantity } from "./cusEntsToPrepaidQuantity";

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

	return cusEntToVolumeInvoiceQuantity({
		cusEnt,
		paidQuantity: prepaidQuantity,
	});
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
