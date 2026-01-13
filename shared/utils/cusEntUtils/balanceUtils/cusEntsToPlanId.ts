import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";

export const cusEntsToPlanId = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	if (cusEnts.length !== 1) return null;

	return cusEnts[0].customer_product?.product.id ?? null;
};
