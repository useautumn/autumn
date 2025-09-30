import {
	type AttachBranch,
	type AttachConfig,
	UsageModel,
} from "@autumn/shared";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import {
	attachParamsToProduct,
	attachParamToCusProducts,
	paramsToCurSub,
} from "../attachUtils/convertAttachParams.js";

export const getDowngradeProductPreview = async ({
	attachParams,
	now,
	logger,
	branch,
	config,
}: {
	attachParams: AttachParams;
	now: number;
	logger: any;
	branch: AttachBranch;
	config: AttachConfig;
}) => {
	const newProduct = attachParamsToProduct({ attachParams });

	const { curCusProduct } = attachParamToCusProducts({ attachParams });
	const sub = await paramsToCurSub({ attachParams });

	let items = await getItemsForNewProduct({
		newProduct,
		attachParams,
		logger,
	});

	items = items.filter((item) => item.usage_model !== UsageModel.Prepaid);

	const options = getOptions({
		prodItems: mapToProductItems({
			prices: newProduct.prices,
			entitlements: newProduct.entitlements,
			features: attachParams.features,
		}),
		features: attachParams.features,
		// anchorToUnix,
	});

	const latestPeriodEnd = sub ? getLatestPeriodEnd({ sub }) * 1000 : undefined;
	const nextCycleAt = curCusProduct?.trial_ends_at
		? curCusProduct.trial_ends_at
		: latestPeriodEnd;

	return {
		currency: attachParams.org.default_currency,
		due_next_cycle: {
			line_items: items,
			due_at: nextCycleAt,
		},
		options,
	};
};
