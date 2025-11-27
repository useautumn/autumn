import {
	type AttachBodyV0,
	AttachFunction,
	cusProductToProduct,
} from "@autumn/shared";
import { attachParamToCusProducts } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { getAttachBranch } from "@/internal/customers/attach/attachUtils/getAttachBranch.js";
import { getAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import { getAttachFunction } from "@/internal/customers/attach/attachUtils/getAttachFunction.js";
import { getDowngradeProductPreview } from "@/internal/customers/attach/handleAttachPreview/getDowngradeProductPreview.js";
import { getNewProductPreview } from "@/internal/customers/attach/handleAttachPreview/getNewProductPreview.js";
import { getUpgradeProductPreview } from "@/internal/customers/attach/handleAttachPreview/getUpgradeProductPreview.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";

export const attachParamsToPreview = async ({
	ctx,
	attachParams,
	attachBody,
	withPrepaid = false,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	attachBody: AttachBodyV0;
	withPrepaid?: boolean;
}) => {
	const { logger } = ctx;
	// Handle existing product

	const branch = await getAttachBranch({
		ctx,
		attachBody,
		attachParams,
		fromPreview: true,
	});

	const { config } = await getAttachConfig({
		ctx,
		attachParams,
		attachBody,
		branch,
	});

	const func = await getAttachFunction({
		branch,
		attachParams,
		attachBody,
		config,
	});

	logger.info("--------------------------------");
	logger.info(`ATTACH PREVIEW (org: ${attachParams.org.id})`);
	logger.info(`Branch: ${branch}, Function: ${func}`);

	const now = attachParams.now || Date.now();

	let preview: any = null;

	if (
		func === AttachFunction.AddProduct ||
		func === AttachFunction.CreateCheckout ||
		func === AttachFunction.OneOff
	) {
		preview = await getNewProductPreview({
			branch,
			attachParams,
			logger,
			config,
			withPrepaid,
		});
	}

	if (func === AttachFunction.ScheduleProduct) {
		preview = await getDowngradeProductPreview({
			attachParams,
			now,
			logger,
			branch,
			config,
			withPrepaid,
		});
	}

	if (
		func === AttachFunction.UpgradeDiffInterval ||
		func === AttachFunction.UpgradeSameInterval ||
		func === AttachFunction.UpdatePrepaidQuantity
	) {
		preview = await getUpgradeProductPreview({
			ctx,
			attachParams,
			branch,
			now,
			withPrepaid,
			config,
		});
	}

	const { curMainProduct, curScheduledProduct } = attachParamToCusProducts({
		attachParams,
	});

	return {
		branch,
		func,
		...preview,
		current_product: curMainProduct
			? cusProductToProduct({
					cusProduct: curMainProduct,
				})
			: null,
		scheduled_product: curScheduledProduct,
	};
};
