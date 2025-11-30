import {
	AttachBranch,
	type AttachConfig,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { createFullCusProduct } from "../../../add-product/createFullCusProduct.js";
import type { AttachParams } from "../../../cusProducts/AttachParams.js";
import { attachParamsToCurCusProduct } from "../../attachUtils/convertAttachParams.js";
import { getDefaultAttachConfig } from "../../attachUtils/getAttachConfig.js";
import { getMergeCusProduct } from "./getMergeCusProduct.js";
import { handlePaidProduct } from "./handlePaidProduct.js";

export const handleAddProduct = async ({
	ctx,
	attachParams,
	config,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be used in the future
	branch,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config?: AttachConfig;
	branch?: AttachBranch;
}) => {
	const { logger, db } = ctx;
	const { customer, products, prices } = attachParams;

	const defaultConfig: AttachConfig = getDefaultAttachConfig();

	// 1. If paid product

	if (prices.length > 0) {
		return await handlePaidProduct({
			ctx,
			attachParams,
			config: config || defaultConfig,
		});
	}

	logger.info("Inserting free product in handleAddProduct");

	const batchInsert = [];

	const { mergeSub } = await getMergeCusProduct({
		attachParams,
		config: config || defaultConfig,
		products,
	});

	for (const product of products) {
		const curCusProduct = attachParamsToCurCusProduct({ attachParams });
		let anchorToUnix: number | undefined;

		if (curCusProduct && config?.branch === AttachBranch.NewVersion) {
			anchorToUnix = curCusProduct.created_at;
		}

		if (mergeSub) {
			const { end } = subToPeriodStartEnd({ sub: mergeSub });
			anchorToUnix = end * 1000;
		}

		// Expire previous product

		batchInsert.push(
			createFullCusProduct({
				db,
				attachParams: attachToInsertParams(attachParams, product),
				billLaterOnly: true,
				carryExistingUsages: config?.carryUsage || false,
				anchorToUnix,
				logger,
			}),
		);
	}
	await Promise.all(batchInsert);

	logger.info("Successfully created full cus product");

	return AttachFunctionResponseSchema.parse({
		message: `Successfully attached ${products.map((p) => p.name).join(", ")} to ${customer.name}`,
		code: SuccessCode.FreeProductAttached,
	});

	// if (res) {
	// 	const productNames = products.map((p) => p.name).join(", ");
	// 	const customerName = customer.name || customer.email || customer.id;
	// 	if (req.apiVersion.gte(ApiVersion.V1_1)) {
	// 		res.status(200).json(
	// 			AttachResultSchema.parse({
	// 				success: true,
	// 				code: SuccessCode.FreeProductAttached,
	// 				message: `Successfully attached ${productNames} to ${customerName}`,
	// 				product_ids: products.map((p) => p.id),
	// 				customer_id: customer.id || customer.internal_id,
	// 			}),
	// 		);
	// 	} else {
	// 		res.status(200).json({
	// 			success: true,
	// 		});
	// 	}
	// }
};

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
	const { products, prices } = attachParams;

	const defaultConfig: AttachConfig = getDefaultAttachConfig();

	// 1. If paid product

	if (prices.length < 0) {
		return;
	}

	logger.info("Inserting free product in handleFreeProduct");

	const batchInsert = [];

	const { mergeSub } = await getMergeCusProduct({
		attachParams,
		config: config || defaultConfig,
		products,
	});

	for (const product of products) {
		const curCusProduct = attachParamsToCurCusProduct({ attachParams });
		let anchorToUnix: number | undefined;

		if (curCusProduct && config?.branch === AttachBranch.NewVersion) {
			anchorToUnix = curCusProduct.created_at;
		}

		if (mergeSub) {
			const { end } = subToPeriodStartEnd({ sub: mergeSub });
			anchorToUnix = end * 1000;
		}

		// Expire previous product

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

	logger.info("Successfully created full cus product");
};
