import { DrizzleCli } from "@/db/initDrizzle.js";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { getDefaultAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachBranch } from "@autumn/shared";
import Stripe from "stripe";
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

	logger.info(`HANDLING SETUP CHECKOUT COMPLETED`);

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
