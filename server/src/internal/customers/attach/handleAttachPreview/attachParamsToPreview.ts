import { type AttachBody, AttachBranch, AttachFunction } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import { cusProductToProduct } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { attachParamToCusProducts } from "../attachUtils/convertAttachParams.js";
import { getAttachBranch } from "../attachUtils/getAttachBranch.js";
import { getAttachConfig } from "../attachUtils/getAttachConfig.js";
import { getAttachFunction } from "../attachUtils/getAttachFunction.js";
import { getDowngradeProductPreview } from "./getDowngradeProductPreview.js";
import { getMultiAttachPreview } from "./getMultiAttachPreview.js";
import { getNewProductPreview } from "./getNewProductPreview.js";
import { getUpgradeProductPreview } from "./getUpgradeProductPreview.js";

export const attachParamsToPreview = async ({
	req,
	attachParams,
	attachBody,
	logger,
	withPrepaid = false,
}: {
	req: ExtendedRequest;
	attachParams: AttachParams;
	attachBody: AttachBody;
	logger: any;
	withPrepaid?: boolean;
}) => {
	// Handle existing product

	const branch = await getAttachBranch({
		req,
		attachBody,
		attachParams,
		fromPreview: true,
	});

	const { flags, config } = await getAttachConfig({
		req,
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
		branch === AttachBranch.MultiAttach ||
		notNullish(attachParams.productsList)
	) {
		preview = await getMultiAttachPreview({
			req,
			attachBody,
			attachParams,
			logger,
			config,
			branch,
		});
	} else if (
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
		});
	}

	if (
		func === AttachFunction.UpgradeDiffInterval ||
		func === AttachFunction.UpgradeSameInterval ||
		func === AttachFunction.UpdatePrepaidQuantity
	) {
		preview = await getUpgradeProductPreview({
			req,
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
