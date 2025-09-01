import { AttachBranch } from "@autumn/shared";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import { cusProductToPrices } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { attachParamToCusProducts } from "../attachUtils/convertAttachParams.js";

export const getHasProrations = async ({
	req,
	branch,
	attachParams,
}: {
	req: ExtendedRequest;
	branch: AttachBranch;
	attachParams: AttachParams;
}) => {
	const _hasProrations = false;

	const { curMainProduct } = attachParamToCusProducts({ attachParams });
	if (branch === AttachBranch.Upgrade) {
		const curPrices = cusProductToPrices({ cusProduct: curMainProduct! });

		if (!isFreeProduct(curPrices)) {
			return true;
		}
	}

	if (branch === AttachBranch.UpdatePrepaidQuantity) {
		return true;
	}

	return false;
};
