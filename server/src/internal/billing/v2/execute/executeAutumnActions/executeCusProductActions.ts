import type { CusProductActions, FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { applyOngoingCusProductAction } from "./applyOngoingCusProductAction";
import { insertNewCusProducts } from "./insertNewCusProducts";

export const executeCusProductActions = async ({
	ctx,
	cusProductActions,
	newCusProducts,
}: {
	ctx: AutumnContext;
	cusProductActions: CusProductActions;
	newCusProducts: FullCusProduct[];
}) => {
	// 1. Insert new cus products
	await insertNewCusProducts({
		ctx,
		newCusProducts,
	});

	const { ongoingCusProductAction } = cusProductActions;

	// 2. Apply ongoing cus product action
	if (ongoingCusProductAction) {
		await applyOngoingCusProductAction({
			ctx,
			ongoingCusProductAction,
		});
	}
};
