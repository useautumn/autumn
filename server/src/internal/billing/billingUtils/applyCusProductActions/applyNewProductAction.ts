import type {
	FullCustomer,
	InsertFullCusProductContext,
	NewProductAction,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { insertFullCusProduct } from "../insertFullCusProduct/insertFullCusProduct";

export const applyNewProductAction = async ({
	ctx,
	fullCus,
	newProductAction,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	newProductAction: NewProductAction;
}) => {
	const insertContext: InsertFullCusProductContext = {
		fullCus,
		product: newProductAction.product,
		featureQuantities: [],
		replaceables: [],
	};

	if (newProductAction.timing === "scheduled") {
		return await insertFullCusProduct({ ctx, fullCus, insertContext });
	}
};
