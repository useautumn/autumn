import { CusProductStatus, type OngoingCusProductAction } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { CusProductService } from "../../../customers/cusProducts/CusProductService";

export const applyOngoingCusProductAction = async ({
	ctx,
	ongoingCusProductAction,
}: {
	ctx: AutumnContext;
	ongoingCusProductAction: OngoingCusProductAction;
}) => {
	const { action, cusProduct } = ongoingCusProductAction;
	if (action === "expire") {
		return await CusProductService.update({
			db: ctx.db,
			cusProductId: cusProduct.id,
			updates: {
				status: CusProductStatus.Expired,
			},
		});
	}

	if (action === "cancel") {
		return await CusProductService.update({
			db: ctx.db,
			cusProductId: cusProduct.id,
			updates: {
				canceled: true,
				canceled_at: Date.now(),
				// TODO: add ended_at
			},
		});
	}

	if (action === "uncancel") {
		return await CusProductService.update({
			db: ctx.db,
			cusProductId: cusProduct.id,
			updates: {
				canceled: false,
				canceled_at: null,
				ended_at: null,
			},
		});
	}
};
