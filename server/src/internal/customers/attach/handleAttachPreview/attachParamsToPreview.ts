import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachBody, AttachBranch } from "@autumn/shared";
import { getAttachBranch } from "../attachUtils/getAttachBranch.js";
import { getAttachConfig } from "../attachUtils/getAttachConfig.js";
import { AttachFunction } from "@autumn/shared";
import { getAttachFunction } from "../attachUtils/getAttachFunction.js";
import { cusProductToProduct } from "@autumn/shared";
import { attachParamToCusProducts } from "../attachUtils/convertAttachParams.js";
import { getDowngradeProductPreview } from "./getDowngradeProductPreview.js";
import { getNewProductPreview } from "./getNewProductPreview.js";
import { getUpgradeProductPreview } from "./getUpgradeProductPreview.js";
import { getMultiAttachPreview } from "./getMultiAttachPreview.js";
import { notNullish } from "@/utils/genUtils.js";

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

	let now = attachParams.now || Date.now();

	let preview: any = null;

	if (
		branch == AttachBranch.MultiAttach ||
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
		func == AttachFunction.AddProduct ||
		func == AttachFunction.CreateCheckout ||
		func == AttachFunction.OneOff
	) {
		preview = await getNewProductPreview({
			branch,
			attachParams,
			logger,
			config,
			withPrepaid,
		});
	}

	if (func == AttachFunction.ScheduleProduct) {
		preview = await getDowngradeProductPreview({
			attachParams,
			now,
			logger,
			branch,
			config,
		});
	}

	if (
		func == AttachFunction.UpgradeDiffInterval ||
		func == AttachFunction.UpgradeSameInterval ||
		func == AttachFunction.UpdatePrepaidQuantity
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
