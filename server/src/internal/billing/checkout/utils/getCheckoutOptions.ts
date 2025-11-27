import { type FeatureOptions, isPrepaidPrice } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { attachParamsToProduct } from "../../../customers/attach/attachUtils/convertAttachParams";
import type { AttachParams } from "../../../customers/cusProducts/AttachParams";
import { getPriceOptions } from "../../../products/prices/priceUtils";
import { priceToFeature } from "../../../products/prices/priceUtils/convertPrice";

export const getCheckoutOptions = async ({
	ctx,
	attachParams,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
}) => {
	const product = attachParamsToProduct({ attachParams });
	const prepaidPrices = product.prices.filter((p) =>
		isPrepaidPrice({ price: p }),
	);

	const newOptions: FeatureOptions[] = structuredClone(
		attachParams.optionsList,
	);
	for (const prepaidPrice of prepaidPrices) {
		const feature = priceToFeature({
			price: prepaidPrice,
			features: ctx.features,
		});
		const option = getPriceOptions(prepaidPrice, attachParams.optionsList);
		if (!option) {
			newOptions.push({
				feature_id: feature?.id ?? "",
				internal_feature_id: feature?.internal_id,
				quantity: 1,
			});
		}
	}

	attachParams.optionsList = newOptions;
	return newOptions;
};
