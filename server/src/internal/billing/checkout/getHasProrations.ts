import { AttachBranch, cusProductToPrices } from "@autumn/shared";
import { attachParamsToCurCusProduct } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";

export const getHasProrations = async ({
	branch,
	attachParams,
}: {
	branch: AttachBranch;
	attachParams: AttachParams;
}) => {
	const curCusProduct = attachParamsToCurCusProduct({ attachParams });
	if (branch === AttachBranch.Upgrade) {
		const curPrices = cusProductToPrices({ cusProduct: curCusProduct! });

		if (!isFreeProduct(curPrices)) {
			return true;
		}
	}

	if (branch === AttachBranch.UpdatePrepaidQuantity) {
		return true;
	}

	return false;
};
