import { createStripeCli } from "@/external/stripe/utils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { FullCusProduct, FullCustomer, CusProductStatus } from "@autumn/shared";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { cusProductToSchedule } from "../cusProducts/cusProductUtils/convertCusProduct.js";

export const cancelScheduledProduct = async ({
	req,
	curScheduledProduct,
	fullCus,
	curMainProduct,
}: {
	req: ExtendedRequest;
	curScheduledProduct?: FullCusProduct;
	fullCus: FullCustomer;
	curMainProduct?: FullCusProduct;
}) => {
	const { org, env, db, logger } = req;
	const stripeCli = createStripeCli({ org, env });

	// 1. Delete subscription schedule if exists
	if (curScheduledProduct) {
		const schedule = await cusProductToSchedule({
			cusProduct: curScheduledProduct,
			stripeCli,
		});

		if (schedule) {
			await stripeCli.subscriptionSchedules.cancel(schedule.id);
		}

		logger.info(`Deleting scheduled prod (${curScheduledProduct.product.id})`);
		await CusProductService.delete({
			db,
			cusProductId: curScheduledProduct.id,
		});
	}

	// 2. Uncancel current main product
	const subId = curMainProduct?.subscription_ids?.[0];
	if (subId) {
		await stripeCli.subscriptions.update(subId, { cancel_at: null });
	}

	if (curMainProduct) {
		logger.info(`Updating main prod (${curMainProduct!.product.id}) to active`);
		logger.info(`Cus product ID: ${curMainProduct!.id}`);
		await CusProductService.update({
			db,
			cusProductId: curMainProduct!.id,
			updates: {
				status: CusProductStatus.Active,
				canceled_at: null,
			},
		});
	}
};
