import type {
	FullCusProduct,
	OngoingCusProductAction,
	ScheduledCusProductAction,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { applyOngoingCusProductAction } from "./applyOngoingCusProductAction";
import { insertNewCusProducts } from "./insertNewCusProducts";

export const applyCusProductActions = async ({
	ctx,
	ongoingCusProductAction,
	scheduledCusProductAction,
	newCusProducts,
}: {
	ctx: AutumnContext;
	ongoingCusProductAction?: OngoingCusProductAction;
	scheduledCusProductAction?: ScheduledCusProductAction;
	newCusProducts: FullCusProduct[];
}) => {
	// 1. Insert new cus products
	await insertNewCusProducts({
		ctx,
		newCusProducts,
	});

	// 2. Apply ongoing cus product action
	if (ongoingCusProductAction) {
		await applyOngoingCusProductAction({
			ctx,
			ongoingCusProductAction,
		});
	}
};
