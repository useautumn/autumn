import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { entToOptions } from "../../productUtils/convertProductUtils";

export const cusEntToOptions = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const ent = cusEnt.entitlement;
	return entToOptions({
		ent,
		options: cusEnt.customer_product?.options ?? [],
	});
};
