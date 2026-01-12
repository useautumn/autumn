import {
	AttachBranch,
	type AttachConfig,
	AttachFunction,
	type FullProduct,
	ProrationBehavior,
} from "@autumn/shared";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { handleUpgradeFlow } from "@/internal/customers/attach/attachFunctions/upgradeFlow/handleUpgradeFlow.js";
import { checkSameCustom } from "@/internal/customers/attach/attachUtils/getAttachBranch.js";
import { intervalsAreSame } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";

const getAttachFunction = async ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	if (isFreeProduct(attachParams.prices)) {
		return AttachFunction.AddProduct;
	}

	const sameIntervals = intervalsAreSame({ attachParams });

	if (sameIntervals) {
		return AttachFunction.UpgradeSameInterval;
	}

	return AttachFunction.UpgradeDiffInterval;
};

export const runMigrationAttach = async ({
	ctx,
	attachParams,
	fromProduct,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	fromProduct: FullProduct;
}) => {
	const { logger } = ctx;
	const sameIntervals = intervalsAreSame({ attachParams });
	const branch = AttachBranch.NewVersion;

	// Set config
	const config: AttachConfig = {
		onlyCheckout: false,
		carryUsage: true,
		branch,
		proration: ProrationBehavior.None,
		disableTrial: true,
		invoiceOnly: false,
		disableMerge: false,
		sameIntervals,
		carryTrial: true,
		invoiceCheckout: false,
		finalizeInvoice: true,
		requirePaymentMethod: false,
	};

	// Check if branch is update custom ents...

	const attachFunction = await getAttachFunction({ attachParams });

	const customer = attachParams.customer;
	logger.info(`--------------------------------`);
	logger.info(
		`Running migration for ${customer.id} (E: ${attachParams.entityId || "N/A"}), function: ${attachFunction}`,
	);

	let sameCustomBranch: AttachBranch | undefined;
	try {
		const curSameProduct = attachParams.customer.customer_products.find(
			(cp) => cp.product.internal_id === fromProduct.internal_id,
		);
		sameCustomBranch = curSameProduct
			? await checkSameCustom({
					attachParams,
					curSameProduct,
					optionsToUpdate: [],
				})
			: undefined;
	} catch (error) {
		console.log("Error:", error);
	}

	if (attachFunction === AttachFunction.AddProduct) {
		return await handleAddProduct({
			ctx,
			attachParams,
			config,
		});
	} else if (attachFunction === AttachFunction.UpgradeSameInterval) {
		await handleUpgradeFlow({
			ctx,
			attachParams,
			config,
			fromMigration: true,
			branch:
				sameCustomBranch === AttachBranch.SameCustomEnts
					? AttachBranch.SameCustomEnts
					: branch,
		});
	}
};
