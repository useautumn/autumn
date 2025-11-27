import { AttachBranch } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { handleOneOffFunction } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleOneOffFunction.js";
import { getDefaultAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getCusPaymentMethod } from "../../stripeCusUtils.js";

export const handleSetupCheckout = async ({
	ctx,
	attachParams,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
}) => {
	const { logger } = ctx;

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
			ctx,
			attachParams,
			config: getDefaultAttachConfig(),
		});
		return;
	}
	// 1. Check attach prices...
	await handleAddProduct({
		ctx,
		attachParams: {
			...attachParams,
			stripeCli: createStripeCli({ org, env: customer.env }),
		},
		branch: AttachBranch.New,
		config: getDefaultAttachConfig(),
	});
};
