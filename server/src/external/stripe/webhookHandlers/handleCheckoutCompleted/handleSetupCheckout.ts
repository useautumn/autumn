import { AttachBranch } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { handleOneOffFunction } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleOneOffFunction.js";
import { getDefaultAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { getCusPaymentMethod } from "../../stripeCusUtils.js";
import { createStripeCli } from "../../utils.js";

export const handleSetupCheckout = async ({
	req,
	db,
	attachParams,
}: {
	req: ExtendedRequest;
	db: DrizzleCli;
	attachParams: AttachParams;
}) => {
	const logger = req.logger;

	const { org, customer } = attachParams;

	const paymentMethod = await getCusPaymentMethod({
		stripeCli: createStripeCli({ org, env: customer.env }),
		stripeId: customer.processor?.id,
		errorIfNone: false,
	});

	attachParams.paymentMethod = paymentMethod;

	logger.info(`HANDLING SETUP CHECKOUT COMPLETED`);

	if (isOneOff(attachParams.prices)) {
		await handleOneOffFunction({
			req,
			attachParams,
			config: getDefaultAttachConfig(),
			res: undefined,
		});
		return;
	}
	// 1. Check attach prices...
	await handleAddProduct({
		req,
		attachParams: {
			...attachParams,
			stripeCli: createStripeCli({ org, env: customer.env }),
		},
		branch: AttachBranch.New,
		config: getDefaultAttachConfig(),
	});
};
