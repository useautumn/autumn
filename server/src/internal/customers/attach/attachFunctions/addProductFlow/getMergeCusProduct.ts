import type { AttachConfig, FullCusProduct, FullProduct } from "@autumn/shared";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";

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
