import {
	type AttachConfig,
	type FullCusProduct,
	type FullProduct,
	Product,
	products,
} from "@autumn/shared";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

export const getMergeCusProduct = async ({
	attachParams,
	products,
	config,
}: {
	attachParams: AttachParams;
	products: FullProduct[];
	config: AttachConfig;
}) => {
	const { stripeCli, cusProducts, freeTrial } = attachParams;

	let mergeCusProduct: FullCusProduct | undefined;
	if (!config.disableMerge && !freeTrial) {
		mergeCusProduct = cusProducts?.find((cp) =>
			products.some((p) => p.group === cp.product.group),
		);
	}

	const mergeSub = await cusProductToSub({
		cusProduct: mergeCusProduct,
		stripeCli,
	});
	// let mergeSubs = await getStripeSubs({
	//   stripeCli,
	//   subIds: mergeCusProduct?.subscription_ids,
	// });

	return {
		mergeCusProduct,
		mergeSub: mergeSub || undefined,
	};
};
