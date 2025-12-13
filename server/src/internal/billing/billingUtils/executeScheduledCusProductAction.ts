// import type { ScheduledCusProductAction } from "@autumn/shared";
// import type { AutumnContext } from "../../../honoUtils/HonoEnv";
// import { CusProductService } from "../../customers/cusProducts/CusProductService";

// export const executeScheduledCusProductAction = async ({
// 	ctx,
// 	scheduledCusProductAction,
// }: {
// 	ctx: AutumnContext;
// 	scheduledCusProductAction?: ScheduledCusProductAction;
// }) => {
// 	if (!scheduledCusProductAction) return;

// 	const { action, cusProduct } = scheduledCusProductAction;

// 	if (action === "delete") {
// 		return await CusProductService.delete({
// 			db: ctx.db,
// 			cusProductId: cusProduct.id,
// 		});
// 	}
// };
