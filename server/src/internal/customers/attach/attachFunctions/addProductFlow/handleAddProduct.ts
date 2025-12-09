import {
	AttachBranch,
	type AttachConfig,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { getCustomerDisplay } from "../../../../billing/attach/utils/getCustomerDisplay.js";
import { createFullCusProduct } from "../../../add-product/createFullCusProduct.js";
import type { AttachParams } from "../../../cusProducts/AttachParams.js";
import { attachParamsToMergeCusProduct } from "../../attachUtils/convertAttachParams.js";
import { getDefaultAttachConfig } from "../../attachUtils/getAttachConfig.js";
import { getMergeCusProduct } from "./getMergeCusProduct.js";
import { handlePaidProduct } from "./handlePaidProduct.js";

export const handleFreeProduct = async ({
	ctx,
	attachParams,
	config,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config?: AttachConfig;
}) => {
	const { logger } = ctx;
	const { products, customer } = attachParams;

	const defaultConfig: AttachConfig = getDefaultAttachConfig();

	logger.info("Inserting free product in handleFreeProduct");

	const batchInsert = [];

	const { mergeSub } = await getMergeCusProduct({
		attachParams,
		config: config || defaultConfig,
		products,
	});

	for (const product of products) {
		const mergeCusProduct = attachParamsToMergeCusProduct({ attachParams });
		let anchorToUnix: number | undefined;

		if (mergeCusProduct && config?.branch === AttachBranch.NewVersion) {
			anchorToUnix = mergeCusProduct.created_at;
		}

		if (mergeSub) {
			const { end } = subToPeriodStartEnd({ sub: mergeSub });
			anchorToUnix = end * 1000;
		}

		batchInsert.push(
			createFullCusProduct({
				db: ctx.db,
				attachParams: attachToInsertParams(attachParams, product),
				billLaterOnly: true,
				carryExistingUsages: config?.carryUsage || false,
				anchorToUnix,
				logger,
			}),
		);
	}
	await Promise.all(batchInsert);

	logger.info("Successfully inserted free cus product");

	const customerName = getCustomerDisplay({ customer });
	return AttachFunctionResponseSchema.parse({
		message: `Successfully inserted free product ${products.map((p) => p.name).join(", ")} to ${customerName}`,
		code: SuccessCode.FreeProductAttached,
	});
};

export const handleAddProduct = async ({
	ctx,
	attachParams,
	config,
	branch,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config?: AttachConfig;
	branch?: AttachBranch;
}) => {
	const { prices } = attachParams;

	const defaultConfig: AttachConfig = getDefaultAttachConfig();

	if (prices.length > 0) {
		return await handlePaidProduct({
			ctx,
			attachParams,
			config: config || defaultConfig,
			branch: branch || AttachBranch.New,
		});
	}

	return await handleFreeProduct({
		ctx,
		attachParams,
		config: config || defaultConfig,
	});
};
